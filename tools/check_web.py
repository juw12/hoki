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
    browser = p.chromium.launch(channel="msedge")

    # Phone
    phone = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True)
    page = phone.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(base)
    page.wait_for_selector("#hoki-paw")

    angles = []
    for _ in range(16):
        angles.append(page.evaluate("window.hoki.getAngle()"))
        page.wait_for_timeout(90)
    spread = max(angles) - min(angles)
    check(spread > 6, f"paw waves smoothly on its own (angle spread {spread:.1f} deg)")
    check(len({round(a, 1) for a in angles}) >= 8, "paw moves continuously, not in a few frames")
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

    page.reload()
    page.wait_for_selector("#hoki-paw")
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
    page.screenshot(path=str(OUT / "phone_desktop_panel.png"))
    fgrade_phone = page.inner_text("#fortune-grade")
    check("吉" in fgrade_phone, f"phone shows a daily 吉 fortune ({fgrade_phone!r})")
    check(len(page.inner_text("#fortune-blessing").strip()) >= 10, "phone fortune has a blessing line")
    check(page.is_visible("#fortune-share"), "phone shows the share action")
    check(not errors, f"no console errors ({errors})")

    # Widget mode
    widget = browser.new_context(viewport={"width": 260, "height": 300})
    wpage = widget.new_page()
    wpage.goto(base + "?widget")
    wpage.wait_for_selector("#hoki-paw")
    check(not wpage.is_visible(".top") and not wpage.is_visible(".foot"), "widget mode hides chrome")
    check(not wpage.is_visible("#fortune-share"), "widget hides the share action")
    wpage.screenshot(path=str(OUT / "widget.png"), omit_background=True)

    # Desktop browser
    desk = browser.new_context(viewport={"width": 1280, "height": 800})
    dpage = desk.new_page()
    dpage.goto(base)
    dpage.wait_for_selector("#hoki-paw")
    cat_box = dpage.locator("#cat").bounding_box()
    check(cat_box["y"] + cat_box["height"] <= 800, "cat fits a 1280x800 window")

    # Daily fortune card in the right column.
    f = dpage.evaluate("window.hoki.getFortune()")
    check(isinstance(f, dict) and 0 <= f["index"] < f["count"], f"fortune index in range ({f['index']}/{f['count']})")
    dom_grade = dpage.inner_text("#fortune-grade")
    check(dom_grade == f["grade"] and "吉" in dom_grade, f"rendered 吉 grade matches state ({dom_grade!r})")
    check(len(dpage.inner_text("#fortune-blessing").strip()) >= 10, "desktop fortune has a blessing line")
    side_h = dpage.locator(".side").bounding_box()["height"]
    stage_h = dpage.locator(".stage").bounding_box()["height"]
    check(side_h >= 0.78 * stage_h, f"right column not under-filled (side {side_h:.0f}px vs scene {stage_h:.0f}px)")

    # Share action: a quiet copy button that composes grade + blessing.
    check(dpage.is_visible("#fortune-share"), "desktop shows the share action")
    share_text = dpage.evaluate("window.hoki.getShareText()")
    check(isinstance(share_text, str) and f["grade"] in share_text and f["line"] in share_text,
          f"share text composes grade + blessing ({share_text!r})")

    # One per day: the same date gives the same fortune across a reload.
    f_index_before = f["index"]
    dpage.reload()
    dpage.wait_for_selector("#hoki-paw")
    check(dpage.evaluate("window.hoki.getFortune().index") == f_index_before, "same fortune survives a reload (one per day)")

    # Test hook: ?fortune=n forces a specific slip.
    dpage.goto(base + "?fortune=0")
    dpage.wait_for_selector("#hoki-paw")
    check(dpage.evaluate("window.hoki.getFortune().index") == 0, "?fortune=0 override selects slip 0")

    dpage.goto(base)
    dpage.wait_for_selector("#hoki-paw")
    dpage.screenshot(path=str(OUT / "desktop.png"))

    # Service worker + manifest
    dpage.wait_for_timeout(800)
    sw_ok = dpage.evaluate("navigator.serviceWorker.getRegistration().then(r => !!r)")
    check(sw_ok, "service worker registers")
    manifest = dpage.evaluate("fetch('manifest.webmanifest').then(r => r.json())")
    check(any(i["sizes"] == "512x512" for i in manifest["icons"]), "manifest has a 512px icon")

    browser.close()

server.shutdown()
print(f"\n{len(failures)} failure(s). Screenshots in {OUT}")
sys.exit(1 if failures else 0)
