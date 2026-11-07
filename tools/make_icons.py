"""Build assets/icon.svg and PNG icons (180/192/512) from assets/cat.svg.

Run from the repo root:  python tools/make_icons.py
Pure Python + Pillow: the cat is pixel art made of 1-pixel runs, so it is rasterised directly
(no browser needed). Uses the body plus paw frame 0.
"""
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
BACKGROUND = "#8f0f1c"
RING = "#a8162a"

cat_svg = (ASSETS / "cat.svg").read_text(encoding="utf-8")
view_w, view_h = (int(float(v)) for v in re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', cat_svg).groups())
groups = dict(re.findall(r'<g id="([^"]+)"[^>]*>(.*?)</g>', cat_svg, re.S))
icon_parts = groups["hoki-body"] + groups["hoki-paw-0"]
runs = re.compile(r"M(\d+) (\d+)h(\d+)v(\d+)h-\d+z")
px_size = int(runs.search(icon_parts).group(4))

# Square canvas, ~16% padding so the cat survives maskable cropping.
side = round(max(view_w, view_h) * 1.32)
offset_x = (side - view_w) // 2
offset_y = (side - view_h) // 2

icon_svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}" shape-rendering="crispEdges">\n'
    f'  <rect width="{side}" height="{side}" fill="{BACKGROUND}"/>\n'
    f'  <circle cx="{side / 2}" cy="{side / 2}" r="{side * 0.42}" fill="{RING}"/>\n'
    f'  <g transform="translate({offset_x} {offset_y})">{icon_parts}</g>\n'
    f"</svg>\n"
)
(ASSETS / "icon.svg").write_text(icon_svg, encoding="utf-8")


def hex_rgb(value):
    return tuple(int(value[i : i + 2], 16) for i in (1, 3, 5))


# Rasterise at 1 image pixel per sprite pixel, then scale up with nearest-neighbour.
cells = side // px_size
base = Image.new("RGB", (cells, cells), hex_rgb(BACKGROUND))
pixels = base.load()
centre = cells / 2
for y in range(cells):
    for x in range(cells):
        if (x + 0.5 - centre) ** 2 + (y + 0.5 - centre) ** 2 <= (cells * 0.42) ** 2:
            pixels[x, y] = hex_rgb(RING)
for fill, path in re.findall(r'fill="(#[0-9a-f]{6})" d="([^"]+)"', icon_parts):
    for x, y, run, _ in runs.findall(path):
        for k in range(int(run) // px_size):
            pixels[(int(x) + offset_x) // px_size + k, (int(y) + offset_y) // px_size] = hex_rgb(fill)

for size in (180, 192, 512):
    big = base.resize((cells * (size // cells + 1),) * 2, Image.NEAREST)
    big.resize((size, size), Image.NEAREST).save(ASSETS / f"icon-{size}.png")

print("icons written to", ASSETS)
