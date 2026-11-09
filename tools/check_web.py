"""Smoke test for the Hoki web app.

Run from the repo root:  python tools/check_web.py [out_dir]
Serves the folder on a free port, drives it with Edge via Playwright,
asserts behaviour, and saves screenshots. Exit code 1 on failure.
"""
import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "tools" / "out"
OUT.mkdir(parents=True, exist_ok=True)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


handler = functools.partial(QuietHandler, directory=str(ROOT))
server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
server.daemon_threads = True
port = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{port}/"

failures = []


def check(condition, message):
    print(("PASS " if condition else "FAIL ") + message)
    if not condition:
        failures.append(message)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])

    # Phone
    phone = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True)
    page = phone.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(base, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function("window.hoki && window.hoki.isReady()", timeout=60000)

    folds = []
    for _ in range(28):  # ~3 s: two full beckons even on a slow software-GL test machine
        folds.append(page.evaluate("window.hoki.getFold()"))
        page.wait_for_timeout(110)
    spread = max(folds) - min(folds)
    check(spread > 0.5, f"paw beckons front-to-back on its own (fold spread {spread:.2f})")
    check(len({round(f, 2) for f in folds}) >= 8, "paw moves continuously, not in a few frames")
    check(page.evaluate("window.hoki.getRenderer()") == "3d", "the cat is a real 3D model (WebGL canvas)")
    poses = []
    for _ in range(26):  # one full beckon, sampled slowly enough for software WebGL
        poses.append(page.evaluate("window.hoki.getPose()"))
        page.wait_for_timeout(110)
    wrist_spread = max(p["wristX"] for p in poses) - min(p["wristX"] for p in poses)
    sideways = max(abs(p["wristZ"]) for p in poses)
    check(
        wrist_spread > 0.4 and sideways < 1e-6,
        f"beckon folds the paw toward the viewer about the X axis (wrist swing {wrist_spread:.2f} rad, sideways {sideways:.2f})",
    )
    # Separate context; under software WebGL the busy 3D page can delay the 'load' event, so wait for the DOM.
    flat_context = browser.new_context(viewport={"width": 390, "height": 844})
    flat = flat_context.new_page()
    flat.goto(base + "?flat", wait_until="domcontentloaded", timeout=60000)
    flat.wait_for_function("window.hoki && window.hoki.isReady()", timeout=60000)
    flat_ok = flat.evaluate("window.hoki.getRenderer() === 'svg' && !!document.getElementById('hoki-hand')")
    check(flat_ok, "flat SVG fallback still works (?flat / no WebGL)")
    flat_context.close()
    serif = page.evaluate("getComputedStyle(document.querySelector('.brand')).fontFamily")
    check("serif" in serif.lower() and "pixel" not in serif.lower(), f"serif display type ({serif[:40]})")
    scene_ok = page.evaluate("!!document.querySelector('.scene .gate-ring') && document.documentElement.dataset.time.length > 0")
    check(scene_ok, "moon-gate scene with time of day")
    page.screenshot(path=str(OUT / "phone_idle.png"))

    boost_before = page.evaluate("window.hoki.getBoost()")
    for _ in range(7):
        page.click("#cat")
        page.wait_for_timeout(60)
    check(page.inner_text("#today") == "7", f"7 taps -> today shows {page.inner_text('#today')}")
    boost = page.evaluate("window.hoki.getBoost()")
    check(boost > boost_before + 0.2, f"boost rises with taps ({boost_before:.2f} -> {boost:.2f})")

    page.click("#cat")
    page.wait_for_timeout(700)  # let the toast finish sliding in before the screenshot
    toast_text = page.inner_text("#toast")
    check("发" in toast_text, f"8th tap shows the 发 milestone ({toast_text!r})")
    check(page.inner_text("#next") == "28", f"next lucky number after 8 is {page.inner_text('#next')}")
    page.screenshot(path=str(OUT / "phone_milestone.png"))

    page.reload(wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function("window.hoki && window.hoki.isReady()", timeout=60000)
    check(page.inner_text("#today") == "8" and page.inner_text("#total") == "8", "count survives reload")

    page.keyboard.press("Tab")
    page.keyboard.press("Tab")
    page.focus("#cat")
    page.keyboard.press("Enter")
    check(page.inner_text("#today") == "9", "keyboard Enter taps the cat")

    page.click("#sound")
    check(page.get_attribute("#sound", "aria-pressed") == "false", "sound toggles off")

    page.click("#desktop-toggle")
    check(page.is_visible("#install-cmd"), "desktop widget instructions open")

    page.click("#phone-toggle")
    apk_href = page.get_attribute("#apk-link", "href") or ""
    check(
        page.is_visible("#apk-link") and apk_href.endswith("/releases/latest/download/hoki-widget.apk"),
        f"phone widget panel opens with the APK link ({apk_href})",
    )
    page.click("#phone-toggle")
    page.screenshot(path=str(OUT / "phone_desktop_panel.png"))
    check(not errors, f"no console errors ({errors})")

    # Widget mode
    phone.close()
    widget = browser.new_context(viewport={"width": 260, "height": 300})
    wpage = widget.new_page()
    wpage.goto(base + "?widget", wait_until="domcontentloaded", timeout=60000)
    wpage.wait_for_function("window.hoki && window.hoki.isReady()", timeout=60000)
    check(not wpage.is_visible(".top") and not wpage.is_visible(".foot"), "widget mode hides chrome")
    check(not wpage.is_visible("#fortune-share"), "widget mode hides the fortune Share button")
    wpage.screenshot(path=str(OUT / "widget.png"), omit_background=True)

    # Desktop browser
    widget.close()
    desk = browser.new_context(viewport={"width": 1280, "height": 800})
    dpage = desk.new_page()
    dpage.goto(base, wait_until="domcontentloaded", timeout=60000)
    dpage.wait_for_function("window.hoki && window.hoki.isReady()", timeout=60000)
    cat_box = dpage.locator("#cat").bounding_box()
    check(cat_box["y"] + cat_box["height"] <= 800, "cat fits a 1280x800 window")
    dpage.screenshot(path=str(OUT / "desktop.png"))

    fortune_name = dpage.inner_text("#fortune-name").strip()
    fortune_line = dpage.inner_text("#fortune-line").strip()
    check(fortune_name and len(fortune_line) > 10, f"daily fortune shows ({fortune_name}: {fortune_line})")
    check(dpage.is_visible("#fortune-share"), "fortune Share button visible on desktop")
    check(dpage.get_attribute("#fortune-share-label", "aria-live") == "polite", "Share state (Copied/Shared) is announced to screen readers")
    share_text = dpage.evaluate("window.hoki.getShareText()")
    check(fortune_name in share_text and fortune_line in share_text, f"getShareText has the fortune ({share_text!r})")
    dpage.evaluate("() => { window.__shareData = null; navigator.share = (p) => { window.__shareData = p; return Promise.resolve(); }; navigator.canShare = () => true; }")
    dpage.click("#fortune-share")
    dpage.wait_for_timeout(100)
    shared = dpage.evaluate("window.__shareData")
    check(
        shared and fortune_name in shared.get("text", "") and fortune_line in shared.get("text", ""),
        f"native share sheet receives the fortune ({(shared or {}).get('text', '')!r})",
    )
    hint_box = dpage.locator("#hint").bounding_box()
    stage_box = dpage.locator(".stage").bounding_box()
    hint_center = hint_box["x"] + hint_box["width"] / 2
    stage_center = stage_box["x"] + stage_box["width"] / 2
    check(
        hint_box["y"] >= stage_box["y"] + stage_box["height"] * 0.8 and abs(hint_center - stage_center) < 40,
        "desktop hint sits under the cat",
    )

    # Service worker + manifest
    dpage.wait_for_timeout(800)
    sw_ok = dpage.evaluate("navigator.serviceWorker.getRegistration().then(r => !!r)")
    check(sw_ok, "service worker registers")
    manifest = dpage.evaluate("fetch('manifest.webmanifest').then(r => r.json())")
    check(any(i["sizes"] == "512x512" for i in manifest["icons"]), "manifest has a 512px icon")
    # Only one live 3D page at a time: software WebGL in the test browser is slow.
    desk.close()

    # Dark mode + keyboard focus ring on the cat
    dark = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme="dark")
    kpage = dark.new_page()
    kpage.goto(base, wait_until="domcontentloaded", timeout=60000)
    kpage.wait_for_function("window.hoki && window.hoki.isReady()", timeout=60000)
    for _ in range(6):
        kpage.keyboard.press("Tab")
        if kpage.evaluate("document.activeElement && document.activeElement.id") == "cat":
            break
    focus = kpage.evaluate("""() => {
        const el = document.activeElement;
        const style = getComputedStyle(el);
        return {
            id: el.id,
            outline: style.outlineStyle,
            // a visible gold contour that traces the cat (stacked drop-shadows on its SVG),
            // plus a solid outline that Windows high-contrast mode can paint
            mark: style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) >= 3
                && (getComputedStyle(el.querySelector('svg, canvas')).filter.match(/drop-shadow/g) || []).length >= 4,
        };
    }""")
    check(
        focus["id"] == "cat" and focus["outline"] not in ("none", "") and focus["mark"],
        f"keyboard focus ring around the cat ({focus})",
    )
    kpage.wait_for_timeout(300)
    kpage.screenshot(path=str(OUT / "desktop_dark_focus.png"))

    # Small phone: nothing wider than the screen, count card on the first screen
    dark.close()
    small = browser.new_context(viewport={"width": 375, "height": 667}, device_scale_factor=2, has_touch=True)
    spage = small.new_page()
    spage.goto(base, wait_until="domcontentloaded", timeout=60000)
    spage.wait_for_function("window.hoki && window.hoki.isReady()", timeout=60000)
    no_hscroll = spage.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    stats_box = spage.locator(".stats").bounding_box()
    check(no_hscroll and stats_box["y"] + stats_box["height"] <= 667, "375x667: no sideways scroll, luck card on first screen")
    spage.screenshot(path=str(OUT / "phone_small.png"))

    browser.close()

server.shutdown()
print(f"\n{len(failures)} failure(s). Screenshots in {OUT}")
sys.exit(1 if failures else 0)
