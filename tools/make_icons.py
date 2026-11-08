"""Build assets/icon.svg from assets/cat.svg, then render the PNG icons with Edge (Playwright).

Run from the repo root:  python tools/make_icons.py
The icon is the cat inside a small moon gate on warm paper, matching the app.
"""
import os
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

cat = (ASSETS / "cat.svg").read_text(encoding="utf-8")
# Keep only the drawing (the <g> layers), dropping the outer <svg> and comments.
inner = re.sub(r"<!--.*?-->", "", cat, flags=re.S)
inner = inner[inner.index("<g "):inner.rindex("</svg>")]

# Small-size variant: whiskers, lash flicks, nose highlight and toe lines vanish into
# noise at 180 px and below, so the icon keeps only the shapes that carry the silhouette.
ICON_DROP = [
    r'\s*<path d="M86\.5 93[^>]*/>',             # lash flicks
    r'\s*<ellipse cx="118\.3"[^>]*/>',            # nose highlight
    r'\s*<path d="M16[01] 1[01][04][^>]*/>',       # right whiskers
    r'\s*<path d="M79 104[^>]*/>',                 # left whiskers
    r'\s*<path d="M15[0-9.]+ 20[0-9.]+ Q[^>]*/>',  # lower paw toe lines
    r'\s*<path d="M90 222[^>]*/>',                 # front paw toe lines
]
for pattern in ICON_DROP:
    inner, count = re.subn(pattern, "", inner)
    if count == 0:
        print("icon detail not found (cat redrawn?):", pattern)

icon = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9cc3e4"/>
      <stop offset="0.65" stop-color="#dcebf3"/>
      <stop offset="1" stop-color="#f6efe0"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#f6f2eb"/>
  <circle cx="256" cy="232" r="186" fill="url(#sky)"/>
  <path d="M70 300 C130 268 190 270 256 288 C320 306 380 278 442 280 L442 330 C400 410 330 418 256 418 C170 418 110 400 70 330 Z" fill="#b9c7a5"/>
  <circle cx="256" cy="232" r="186" fill="none" stroke="#e7dccb" stroke-width="16"/>
  <g transform="translate(96 72) scale(1.42)">
{inner}  </g>
</svg>
"""
(ASSETS / "icon.svg").write_text(icon, encoding="utf-8", newline="\n")

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge")
    page = browser.new_page(viewport={"width": 512, "height": 512})
    page.set_content(f"<html><body style='margin:0;background:transparent'>{icon}</body></html>")
    for size in (180, 192, 512):
        page.set_viewport_size({"width": size, "height": size})
        page.evaluate(f"document.querySelector('svg').setAttribute('width', {size}); document.querySelector('svg').setAttribute('height', {size});")
        page.locator("svg").screenshot(path=str(ASSETS / f"icon-{size}.png"), omit_background=True)
        print("wrote", ASSETS / f"icon-{size}.png", flush=True)
os._exit(0)
