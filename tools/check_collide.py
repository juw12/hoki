#!/usr/bin/env python3
"""H4 invariant check: floaters never collide with the lanterns.

Loads the page at phone (390x844) and desktop (1280x800), taps the cat to
spawn the "+1" floater (and, separately, forces a wide 4-char milestone
floater by seeding total=1687 then tapping), and on every poll tick compares
each live .float box to BOTH lantern boxes at that same instant (so lantern
sway is accounted for). Fails on any intersection or if no floater was seen.
"""
import sys, time, threading, functools
import http.server, socketserver
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = socketserver.TCPServer(("127.0.0.1", 0), h)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return port, httpd

def intersects(a, b):
    return not (a["right"] <= b["left"] or a["left"] >= b["right"]
                or a["bottom"] <= b["top"] or a["top"] >= b["bottom"])

# Sample every live .float box and both lantern boxes in ONE call (same instant).
SAMPLE = """
() => {
  const r = (el) => { const b = el.getBoundingClientRect();
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, w: b.width }; };
  return {
    floats: [...document.querySelectorAll('.float')].map(r),
    L: document.querySelector('.lantern-left')  ? r(document.querySelector('.lantern-left'))  : null,
    R: document.querySelector('.lantern-right') ? r(document.querySelector('.lantern-right')) : null,
  };
}
"""

def poll(page, seconds, name, diag):
    """Tap once, then sample float-vs-lantern for `seconds`. Returns (frames, fails, diag)."""
    page.evaluate("() => window.hoki.tap()")
    start = time.time()
    frames = 0
    fails = []
    while time.time() - start < seconds:
        d = page.evaluate(SAMPLE)
        for f in d["floats"]:
            frames += 1
            diag["min_left"]  = min(diag["min_left"],  f["left"])
            diag["max_right"] = max(diag["max_right"], f["right"])
            diag["min_top"]   = min(diag["min_top"],   f["top"])
            for key in ("L", "R"):
                lan = d[key]
                if lan and lan["w"] > 0 and intersects(f, lan):
                    fails.append((key, f, lan))
        page.wait_for_timeout(33)
    return frames, fails, diag

def main():
    port, httpd = serve()
    url = f"http://127.0.0.1:{port}/"
    results = []
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=EDGE)
        for name, w, h in [("phone", 390, 844), ("desktop", 1280, 800)]:
            # --- Test A: normal "+1" floater ---
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2)
            page = ctx.new_page()
            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_selector("#cat", timeout=15000)
            page.wait_for_timeout(450)
            lan = page.evaluate("() => { const l=document.querySelector('.lantern-left').getBoundingClientRect();"
                                " const r=document.querySelector('.lantern-right').getBoundingClientRect();"
                                " return {Lr:l.right, Rl:r.left}; }")
            diag = {"min_left": 1e9, "max_right": -1e9, "min_top": 1e9, "Lr": lan["Lr"], "Rl": lan["Rl"]}
            frames, fails, diag = poll(page, 1.7, f"{name}/+1", diag)
            results.append((f"{name}  '+1' floater", frames, fails, diag))
            ctx.close()

            # --- Test B: wide 4-char milestone floater (seed total=1687, tap -> 1688) ---
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2)
            page = ctx.new_page()
            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_selector("#cat", timeout=15000)
            page.evaluate("() => localStorage.setItem('hoki.v1', JSON.stringify("
                          "{total:1687, today:0, date:'2099-01-01', muted:false}))")
            page.reload(wait_until="domcontentloaded")
            page.wait_for_selector("#cat", timeout=15000)
            page.wait_for_timeout(450)
            diag = {"min_left": 1e9, "max_right": -1e9, "min_top": 1e9, "Lr": 0, "Rl": 0}
            frames, fails, diag = poll(page, 2.4, f"{name}/milestone", diag)
            results.append((f"{name}  4-char milestone", frames, fails, diag))
            page.screenshot(path=str(ROOT / "tools" / "out" / f"collide_{name}.png"))
            ctx.close()
        browser.close()
    httpd.shutdown()

    allfail = False
    print()
    for label, frames, fails, diag in results:
        if frames == 0:
            print(f"[MISS]  {label}: no .float sampled (tap did not spawn one)")
            allfail = True
        elif fails:
            print(f"[FAIL]  {label}: {len(fails)} intersection(s) across {frames} float-frames")
            allfail = True
        else:
            print(f"[OK]    {label}: {frames} float-frames, 0 lantern intersections")
            if label.endswith("+1' floater") and diag.get("min_left", 0) != 1e9:
                print(f"        +1 stayed within clear air: "
                      f"min_left={diag['min_left']:.0f} (left-lantern right={diag['Lr']:.0f}), "
                      f"max_right={diag['max_right']:.0f} (right-lantern left={diag['Rl']:.0f})")
    print()
    return 1 if allfail else 0

if __name__ == "__main__":
    sys.exit(main())
