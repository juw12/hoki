<!-- HERO:START -->
<p align="center">
  <a href="https://juw12.github.io/hoki/"><img src="docs/media/phone.png" alt="Hoki: a waving lucky cat. Tap it for a luck boost." width="300"></a>
  <img src="docs/media/desktop-widget.png" alt="Hoki as a Windows desktop widget" width="220">
</p>

<p align="center">
  <b>A waving lucky cat (招财猫) for your home screen and desktop.</b><br>
  Tap it for a luck boost. Nothing else, on purpose.
</p>

<p align="center">
  <a href="https://juw12.github.io/hoki/"><b>Try it live</b></a> ·
  <a href="#phone-widget-android">Phone widget</a> ·
  <a href="#desktop-widget-windows">Desktop widget</a> ·
  <a href="https://github.com/juw12">More by juw12</a>
</p>

<p align="center">
  <a href="https://juw12.github.io/hoki/"><img src="https://img.shields.io/badge/demo-live-2ea44f" alt="Live demo"></a>
  <img src="https://img.shields.io/badge/Web_%28PWA%29-24292f" alt="Web (PWA)">
  <img src="https://img.shields.io/badge/Windows_widget-24292f" alt="Windows widget">
  <img src="https://img.shields.io/badge/Android_widget-24292f" alt="Android widget">
  <img src="https://img.shields.io/badge/Offline-24292f" alt="Offline">
</p>
<!-- HERO:END -->

## What it does

- The cat waves its paw all day.
- **Tap it**: +1 luck (福 / 财 / 运 / 喜), a bell, coins, and a **luck boost**. Every tap makes the paw wave faster and the glow brighter. The boost fades by half every 6 seconds, so keep tapping.
- **Lucky numbers** (8 发, 28, 88, 168 一路发, 288, 888, 1688, 8888) trigger a big bell and a blessing.
- **Daily fortune**: one quiet 签 (大吉, 中吉, 福, 财 …) per day, the same all day, under the count.
- Counts today and all time. Saved only on your device. No account, no ads, no tracking.

Inspired by the "tap for merit" apps (电子木鱼) and by Sansa (산사), the same spark behind [Jeda](https://github.com/juw12/jeda).

## Home screen (phone)

Open <https://juw12.github.io/hoki/> and add it to your home screen:

- **iPhone (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** the *Add to home screen* button in the app, or menu → *Install app*.

It opens full screen and works offline.

> A live, animated, tappable widget *inside* the iOS/Android widget area needs a native app; the system widget APIs don't allow continuous animation. Hoki installs as a home-screen app instead.

`?widget` gives a cat-only view with a transparent background, e.g. for a browser side panel or a live-wallpaper tool: <https://juw12.github.io/hoki/?widget>

## Phone widget (Android)

A real home-screen widget: the cat waves right on your home screen and a tap adds luck (with a little buzz; lucky numbers buzz longer).

1. Download [hoki-widget.apk](https://github.com/juw12/hoki/releases/latest/download/hoki-widget.apk) on the phone and open it (allow your browser to install apps once).
2. Long-press the home screen, choose **Widgets**, find **Hoki** and drag it out. Resize it as you like.

Opening the Hoki app shows the full web app. The widget counts its own luck (stored on the phone); the web app keeps its count in the browser.

How it works: Android widgets cannot run code to animate, so `tools/make_widget_frames.py` renders 16 frames of the same `assets/cat.svg` with the paw beckoning front-to-back along an eased wave, and a `ViewFlipper` plays them (85 ms per frame). The APK is built and published by GitHub Actions (`.github/workflows/android.yml`) on every change under `android/`. It is signed with a deliberately public key (`android/app/hoki-public.p12`) so updates install over each other; it is a sideloaded hobby app, not a Play Store listing.

**iPhone:** Apple only allows home-screen widgets from App Store apps, so on iPhone use Share > *Add to Home Screen* (full-screen, offline).

## Desktop widget (Windows)

Paste into PowerShell:

```powershell
irm https://juw12.github.io/hoki/desktop/install.ps1 | iex
```

The cat sits on your desktop on the right edge, always on top, with a transparent background.

- **Click** for luck. **Drag** to move.
- **Right-click** for sound, always on top, start with Windows, size (S/M/L), move to corner, and quit.
- No admin rights and no install wizard: it's one PowerShell + WPF script (`desktop/hoki-widget.ps1`) that draws the same `assets/cat.svg` as the web app.
- Files: `%LOCALAPPDATA%\Hoki` (program), `%APPDATA%\Hoki` (your luck + settings), Start menu "Hoki Lucky Cat".
- Uninstall: right-click → Quit, then delete those two folders and the Start menu shortcut.

Without installing: run `desktop/Hoki.cmd` from a checkout.

## Run locally

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1   # http://localhost:8080
python tools/check_web.py                           # smoke test (Playwright + Edge)
powershell -STA -File desktop/hoki-widget.ps1 -Snapshot out.png -SnapshotTaps 8   # render the widget offscreen
powershell -STA -File tools/capture_hoki.ps1                                     # live-capture the on-screen widget -> docs/media/desktop-widget.png
```

`tools/capture_hoki.ps1` grabs the widget as it is actually shown on your desktop (cat + wallpaper behind it) for the README hero. It waits for the desktop to unlock, starts the widget if it is not running, and only falls back to the offscreen `-Snapshot` render when there is no display.

`python tools/make_icons.py` rebuilds `assets/icon.svg` and the PNG icons from `assets/cat.svg` (needs Playwright + Edge).
The look (palette, type, motion, banned defaults) is written down in `design.md`.

## How it's built

| Part | Files |
|---|---|
| Cat art (shared) | `assets/cat.svg`: flat layered vector shapes; the paw beckons front-to-back like a real maneki-neko: the forearm `#hoki-paw` foreshortens from `data-pivot` and the hand `#hoki-hand` folds toward you at `data-wrist` (amounts in `data-beckon`) |
| Web / PWA | `index.html`, `css/style.css`, `js/app.js`, `sw.js`, `manifest.webmanifest` |
| Windows widget | `desktop/hoki-widget.ps1`, `desktop/install.ps1`, `desktop/Hoki.cmd` |
| Checks | `tools/check_web.py`, `-Snapshot` mode of the widget |

No build step and no dependencies.

For fun. Luck not guaranteed.

## License

MIT
