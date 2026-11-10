"""One-off setup for the Android widget project: private signing key, launcher icons.

Run from the repo root:  python tools/android_setup.py
The release key is PRIVATE and never committed. It is written to ~/.keystores/hoki-release.p12
with a random password, and android/keystore.properties (git-ignored) points Gradle at it.
CI gets the same key from the HOKI_KEYSTORE_B64 / HOKI_KEYSTORE_PASSWORD repo secrets.
Back the key up: losing it means users must uninstall before the next APK installs.
Re-running never replaces an existing key.
"""
import datetime
import secrets
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

KEY_DIR = Path.home() / ".keystores"
keystore_path = KEY_DIR / "hoki-release.p12"
props_path = ROOT / "android" / "keystore.properties"

if keystore_path.exists():
    print("keystore exists, keeping it:", keystore_path)
else:
    password = secrets.token_urlsafe(24)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "Hoki"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "juw12"),
    ])
    start = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)
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
        .build(password.encode())
    )
    KEY_DIR.mkdir(parents=True, exist_ok=True)
    keystore_path.write_bytes(pkcs12.serialize_key_and_certificates(b"hoki", key, cert, None, encryption))
    props = (
        f"HOKI_KEYSTORE_FILE={keystore_path.as_posix()}\n"
        f"HOKI_KEYSTORE_PASSWORD={password}\n"
        "HOKI_KEY_ALIAS=hoki\n"
    )
    # Keep a copy next to the key so the password survives a fresh clone.
    (KEY_DIR / "hoki-release.properties").write_text(props, encoding="utf-8")
    print("wrote", keystore_path)

if keystore_path.exists() and not props_path.exists():
    backup = KEY_DIR / "hoki-release.properties"
    if backup.exists():
        props_path.write_text(backup.read_text(encoding="utf-8"), encoding="utf-8")
        print("wrote", props_path)

icon = Image.open(ROOT / "assets" / "icon-512.png").convert("RGBA")
densities = {"mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96, "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192}
for folder, size in densities.items():
    out = RES / folder
    out.mkdir(parents=True, exist_ok=True)
    icon.resize((size, size), Image.LANCZOS).save(out / "ic_launcher.png")
print("wrote launcher icons")
