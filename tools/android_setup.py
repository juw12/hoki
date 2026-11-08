"""One-off setup for the Android widget project: public signing key, launcher icons, CI workflow.

Run from the repo root:  python tools/android_setup.py
The key is deliberately public (committed): it only keeps sideloaded updates installable.
Re-running replaces the key, which would make the next APK fail to install over the old one,
so the script refuses to overwrite an existing key.
"""
import datetime
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "android" / "app"
RES = APP / "src" / "main" / "res"

keystore_path = APP / "hoki-public.p12"
if keystore_path.exists():
    print("keystore exists, keeping it:", keystore_path)
else:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "Hoki"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "juw12"),
    ])
    start = datetime.datetime(2026, 11, 8, tzinfo=datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(start)
        .not_valid_after(start + datetime.timedelta(days=365 * 40))
        .sign(key, hashes.SHA256())
    )
    # Legacy PBE + SHA1 MAC: readable by every JDK keytool / Android Gradle plugin.
    encryption = (
        serialization.PrivateFormat.PKCS12.encryption_builder()
        .kdf_rounds(50000)
        .key_cert_algorithm(pkcs12.PBES.PBESv1SHA1And3KeyTripleDESCBC)
        .hmac_hash(hashes.SHA1())
        .build(b"hoki-public")
    )
    keystore_path.write_bytes(pkcs12.serialize_key_and_certificates(b"hoki", key, cert, None, encryption))
    print("wrote", keystore_path)

icon = Image.open(ROOT / "assets" / "icon-512.png").convert("RGBA")
densities = {"mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96, "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192}
for folder, size in densities.items():
    out = RES / folder
    out.mkdir(parents=True, exist_ok=True)
    icon.resize((size, size), Image.LANCZOS).save(out / "ic_launcher.png")
print("wrote launcher icons")
