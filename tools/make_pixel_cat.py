"""Generate assets/cat.svg as pixel art (single source for the web app and the desktop widget).

Run from the repo root:  python tools/make_pixel_cat.py
The sprite is drawn on a GRID_W x GRID_H pixel grid from simple shapes. Each part gets a
1-pixel dark outline, then details (eyes, mouth, pads...) are placed by hand.
The beckoning paw has PAW_FRAMES frames (groups #hoki-paw-0..N); the apps show one at a time.
"""
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GRID_W = 40
GRID_H = 44
PX = 6  # SVG units per pixel

PALETTE = {
    "K": "#2b1a14",  # outline
    "W": "#fff7e8",  # fur
    "S": "#efd9bd",  # fur shade
    "H": "#ffffff",  # highlight
    "P": "#f59ab1",  # pink (ears, pads, nose)
    "B": "#f7b8c6",  # blush
    "R": "#d62839",  # red (collar, cushion)
    "D": "#8f1428",  # dark red
    "G": "#f8c846",  # gold
    "Y": "#c4861d",  # gold shade
    "O": "#f2973a",  # orange patch
}
CX = 22  # body centre column (left side leaves room for the raised paw)


# ---------- shape masks ----------
def ellipse(cx, cy, rx, ry):
    return {
        (x, y)
        for x in range(GRID_W)
        for y in range(GRID_H)
        if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0
    }


def polygon(points):
    def inside(px, py):
        hit = False
        n = len(points)
        for i in range(n):
            x1, y1 = points[i]
            x2, y2 = points[(i + 1) % n]
            if (y1 > py) != (y2 > py):
                if px < x1 + (py - y1) * (x2 - x1) / (y2 - y1):
                    hit = not hit
        return hit

    return {(x, y) for x in range(GRID_W) for y in range(GRID_H) if inside(x + 0.5, y + 0.5)}


def thick_line(x1, y1, x2, y2, width):
    mask = set()
    length = math.hypot(x2 - x1, y2 - y1)
    for x in range(GRID_W):
        for y in range(GRID_H):
            px, py = x + 0.5, y + 0.5
            t = max(0.0, min(1.0, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (length**2)))
            if math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1))) <= width / 2:
                mask.add((x, y))
    return mask


def rect(x0, y0, x1, y1):
    return {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}


def edge(mask, solid=None):
    """Pixels of mask that touch a pixel outside (mask | solid)."""
    solid = mask | (solid or set())
    return {
        (x, y)
        for (x, y) in mask
        if any((x + dx, y + dy) not in solid for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    }


class Layer:
    def __init__(self):
        self.pixels = {}

    def fill(self, mask, color, outline="K", solid=None):
        for p in mask:
            self.pixels[p] = color
        if outline:
            for p in edge(mask, solid):
                self.pixels[p] = outline

    def put(self, color, *points):
        for p in points:
            self.pixels[p] = color


# ---------- the cat ----------
body_layer = Layer()

cushion = rect(7, 38, 37, 42) - {(7, 38), (37, 38), (7, 42), (37, 42)}
body_layer.fill(cushion, "R")
body_layer.put("D", *[(x, 41) for x in range(8, 37)])
body_layer.put("G", *[(x, 39) for x in range(9, 36, 2)])
body_layer.put("G", (6, 40), (6, 41), (38, 40), (38, 41))  # tassels

body = ellipse(CX, 29.5, 10.5, 10) - {(x, y) for x in range(GRID_W) for y in range(39, GRID_H)}
body_layer.fill(body, "W")
for x, y in body:
    if (x, y) not in edge(body) and (x - CX) / 10 + (y - 29.5) / 10 > 0.75:
        body_layer.put("S", (x, y))

for foot_x in (17, 27):
    foot = ellipse(foot_x + 0.5, 38, 3.2, 1.8)
    body_layer.fill(foot, "W")

ear_left = polygon([(10, 1.5), (11, 12), (19, 7)])
ear_right = polygon([(35, 1.5), (34, 12), (26, 7)])
body_layer.fill(ear_left, "W")
body_layer.fill(ear_right, "W")
body_layer.put("P", (12, 5), (12, 6), (13, 6), (12, 7), (13, 7), (14, 7))
body_layer.put("P", (33, 5), (33, 6), (32, 6), (33, 7), (32, 7), (31, 7))

head = ellipse(CX + 0.5, 13.5, 12.5, 9.5)
head_inner = head - edge(head)
body_layer.fill(head, "W")
for x, y in head_inner:
    if (x - CX) / 12 + (y - 13.5) / 9 > 1.05:
        body_layer.put("S", (x, y))
for p in ellipse(28, 7.5, 3.2, 2.2) & head_inner:
    body_layer.put("O", p)
body_layer.put("K", (17, 6), (18, 6), (18, 7))

# happy closed eyes  ^ ^
for ex in (17, 28):
    body_layer.put("K", (ex - 1, 12), (ex, 11), (ex + 1, 11), (ex + 2, 12))
body_layer.put("B", (14, 14), (15, 14), (16, 14), (29, 14), (30, 14), (31, 14))
body_layer.put("P", (22, 14), (23, 14))  # nose
body_layer.put("K", (21, 15), (22, 16), (23, 16), (24, 15))  # mouth
body_layer.put("K", (35, 13), (36, 13), (37, 12), (35, 15), (36, 15), (37, 16))  # whiskers

# collar hugging the bottom of the head
collar = set()
for x in range(GRID_W):
    dx = (x + 0.5 - (CX + 0.5)) / 12.5
    if abs(dx) < 0.92:
        bottom = 13.5 + 9.5 * math.sqrt(1 - dx * dx)
        for y in range(int(bottom) - 1, int(bottom) + 2):
            if (x, y) in body:
                collar.add((x, y))
body_layer.fill(collar, "R", outline=None)
for x, y in collar:
    if (x, y + 1) not in collar:
        body_layer.put("D", (x, y))

bell = ellipse(CX + 0.5, 25, 2.2, 2.2)
body_layer.fill(bell, "G")
body_layer.put("H", (CX - 1, 24))
body_layer.put("K", (CX, 25), (CX + 1, 25), (CX + 1, 26))

# gold ingot (yuanbao): a boat with upturned tips and a dome, held against the belly
ingot_boat = polygon([(22.5, 28), (25.5, 31), (30.5, 31), (33.5, 28), (32, 34.5), (24, 34.5)])
ingot_dome = ellipse(28, 30, 2.7, 2.6)
body_layer.fill(ingot_boat, "G")
body_layer.fill(ingot_dome, "G")
body_layer.put("Y", *[(x, 33) for x in range(25, 32)])
body_layer.put("Y", (26, 31), (30, 31))
body_layer.put("H", (27, 28))

hug_paw = ellipse(33, 34, 2.3, 2.2)
body_layer.fill(hug_paw, "W")
body_layer.put("K", (32, 34), (34, 34))

# raised arm (static); only the paw animates. Outline it except where it joins the shoulder.
arm = thick_line(13.5, 30, 9, 14, 5.2)
shoulder = {(x, y) for (x, y) in body if y >= 29}
body_layer.fill(arm, "W", solid=shoulder)
for x, y in arm:
    if (x, y) not in edge(arm, shoulder) and x + 0.4 * y > 19.5:
        body_layer.put("S", (x, y))

# ---------- paw frames: up (pads facing you) -> folding -> folded (beckoning) ----------
PAW_FRAMES = []

up = Layer()
paw_up = ellipse(9.5, 9.5, 3.6, 3.8)
up.fill(paw_up, "W", solid=arm)
up.put("P", (9, 10), (10, 10), (9, 11), (10, 11), (7, 8), (9, 7), (11, 8))
PAW_FRAMES.append(up)

mid = Layer()
paw_mid = ellipse(9.5, 11, 3.7, 2.9)
mid.fill(paw_mid, "W", solid=arm)
mid.put("P", (9, 11), (10, 11), (8, 10), (11, 10))
PAW_FRAMES.append(mid)

down = Layer()
paw_down = ellipse(9.5, 12.5, 3.8, 2.2)
down.fill(paw_down, "W", solid=arm)
down.put("K", (8, 11), (10, 11))  # toe creases on the folded paw
PAW_FRAMES.append(down)


# ---------- SVG output ----------
def layer_paths(layer, indent):
    """One <path> per colour, merging horizontal runs of pixels."""
    lines = []
    for color in PALETTE:
        pixels = sorted((y, x) for (x, y), c in layer.pixels.items() if c == color)
        if not pixels:
            continue
        runs = []
        index = 0
        while index < len(pixels):
            y, x = pixels[index]
            length = 1
            while index + length < len(pixels) and pixels[index + length] == (y, x + length):
                length += 1
            runs.append(f"M{x * PX} {y * PX}h{length * PX}v{PX}h{-length * PX}z")
            index += length
        lines.append(f'{indent}<path fill="{PALETTE[color]}" d="{"".join(runs)}"/>')
    return "\n".join(lines)


width = GRID_W * PX
height = GRID_H * PX
frames_svg = "\n".join(
    f'  <g id="hoki-paw-{i}"{"" if i == 0 else " display=\"none\""}>\n{layer_paths(frame, "    ")}\n  </g>'
    for i, frame in enumerate(PAW_FRAMES)
)
svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" shape-rendering="crispEdges" data-paw="{9.5 * PX:g} {9 * PX:g}" data-counter="{8 * PX} {38.4 * PX:g} {29 * PX}">
  <!-- Hoki pixel lucky cat. GENERATED by tools/make_pixel_cat.py: edit that, not this file.
       Paths only, so the Windows widget can draw it too. One #hoki-paw-N frame is shown at a time. -->
  <g id="hoki-body">
{layer_paths(body_layer, "    ")}
  </g>
{frames_svg}
</svg>
"""
(ROOT / "assets" / "cat.svg").write_text(svg, encoding="utf-8")
print(f"wrote assets/cat.svg ({len(svg)} bytes, {len(PAW_FRAMES)} paw frames)")
