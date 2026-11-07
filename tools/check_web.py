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
    page.wait_for_selector("#hoki-paw-0")

    seen_frames = set()
    for _ in range(16):
        seen_frames.add(page.evaluate("window.hoki.getFrame()"))
        page.wait_for_timeout(90)
    visible = page.evaluate("[...document.querySelectorAll('[id^=hoki-paw-]')].filter(g => g.getAttribute('display') !== 'none').length")
    check(len(seen_frames) >= 3, f"paw cycles through sprite frames on its own ({sorted(seen_frames)})")
    check(visible == 1, f"exactly one paw frame visible at a time ({visible})")
    font_ok = page.evaluate("document.fonts.check('16px \"Pixelify Sans\"')")
    check(font_ok, "pixel font loaded")
    page.screenshot(path=str(OUT / "phone_idle.png"))

    boost_before = page.evaluate("window.hoki.getBoost()")
    for _ in range(7):
        page.click("#cat")
        page.wait_for_timeout(60)
    check(page.inner_text("#today") == "7", f"7 taps -> today shows {page.inner_text('#today')}")
    boost = page.evaluate("window.hoki.getBoost()")
    check(boost > boost_before + 0.2, f"boost rises with taps ({boost_before:.2f} -> {boost:.2f})")

    page.click("#cat")
    page.wait_for_timeout(250)
    toast_text = page.inner_text("#toast")
    check("发" in toast_text, f"8th tap shows the 发 milestone ({toast_text!r})")
    check(page.inner_text("#next") == "28", f"next lucky number after 8 is {page.inner_text('#next')}")
    page.screenshot(path=str(OUT / "phone_milestone.png"))

    page.reload()
    page.wait_for_selector("#hoki-paw-0")
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
    check(not errors, f"no console errors ({errors})")

    # Widget mode
    widget = browser.new_context(viewport={"width": 260, "height": 300})
    wpage = widget.new_page()
    wpage.goto(base + "?widget")
    wpage.wait_for_selector("#hoki-paw-0")
    check(not wpage.is_visible(".top") and not wpage.is_visible(".foot"), "widget mode hides chrome")
    wpage.screenshot(path=str(OUT / "widget.png"), omit_background=True)

    # Desktop browser
    desk = browser.new_context(viewport={"width": 1280, "height": 800})
    dpage = desk.new_page()
    dpage.goto(base)
    dpage.wait_for_selector("#hoki-paw-0")
    cat_box = dpage.locator("#cat").bounding_box()
    check(cat_box["y"] + cat_box["height"] <= 800, "cat fits a 1280x800 window")
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
