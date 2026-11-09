"""Build assets/icon.svg and the PNG icons from the real 3D cat.

Run from the repo root after tools/make_widget_frames.py (it renders desktop/frames/cat_00.png,
the 3D cat with its paw raised):  python tools/make_icons.py   (needs Pillow, Playwright + Edge)
The icon is the 3D cat in a small moon gate on warm paper, matching the app.
"""
import base64
import io
import os
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
CAT_FRAME = ROOT / "desktop" / "frames" / "cat_00.png"

# Embed a downscaled copy so assets/icon.svg (also the favicon) stays small.
cat = Image.open(CAT_FRAME).convert("RGBA")
cat = cat.resize((300, round(300 * cat.height / cat.width)), Image.LANCZOS)
buffer = io.BytesIO()
cat.save(buffer, format="PNG", optimize=True)
cat_uri = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")

CAT_W = 344
CAT_H = round(CAT_W * cat.height / cat.width)
icon = f"""<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512">
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
  <image x="{256 - CAT_W // 2}" y="{500 - CAT_H}" width="{CAT_W}" height="{CAT_H}" href="{cat_uri}"/>
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
