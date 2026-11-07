"""Build assets/icon.svg and PNG icons from assets/cat.svg.

Run from the repo root:  python tools/make_icons.py
Needs: playwright (with Microsoft Edge) for PNG rendering.
"""
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

cat_svg = (ASSETS / "cat.svg").read_text(encoding="utf-8")
cat_groups = re.search(r"(<g id=\"hoki-body\">.*</g>)\s*</svg>", cat_svg, re.S).group(1)
cat_groups = cat_groups.replace('id="hoki-body"', "").replace('id="hoki-paw"', "")

# Square canvas with ~12% padding so the cat survives maskable cropping.
icon_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-46 -32 332 332">
  <rect x="-46" y="-32" width="332" height="332" fill="#8f0f1c"/>
  <circle cx="120" cy="134" r="150" fill="#b3121f"/>
  {cat_groups}
</svg>
"""
(ASSETS / "icon.svg").write_text(icon_svg, encoding="utf-8")

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge")
    for size in (180, 192, 512):
        page = browser.new_page(viewport={"width": size, "height": size})
        sized_svg = icon_svg.replace("<svg ", f'<svg width="{size}" height="{size}" ', 1)
        page.set_content(f'<body style="margin:0">{sized_svg}</body>')
        page.screenshot(path=str(ASSETS / f"icon-{size}.png"), clip={"x": 0, "y": 0, "width": size, "height": size})
        page.close()
    browser.close()

print("icons written to", ASSETS)
