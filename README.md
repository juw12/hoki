<!-- HERO:START -->
<p align="center">
  <a href="https://juw12.github.io/hoki/"><img src="docs/media/phone.png" alt="Hoki: a waving lucky cat. Tap it for a luck boost." width="300"></a>
  <img src="docs/media/desktop-widget.png" alt="Hoki on the Windows desktop" width="220">
</p>

<p align="center">
  <b>A waving lucky cat (招财猫) for your home screen and desktop.</b><br>
  Tap it for a luck boost. Nothing else, on purpose.
</p>

<p align="center">
  <a href="https://juw12.github.io/hoki/"><b>Try it live</b></a> ·
  <a href="#phone-widget-android">Phone widget</a> ·
  <a href="#windows-app">Windows app</a> ·
  <a href="https://github.com/juw12">More by juw12</a>
</p>

<p align="center">
  <a href="https://juw12.github.io/hoki/"><img src="https://img.shields.io/badge/demo-live-2ea44f" alt="Live demo"></a>
  <img src="https://img.shields.io/badge/Web_%28PWA%29-24292f" alt="Web (PWA)">
  <img src="https://img.shields.io/badge/Windows_app-24292f" alt="Windows app">
  <img src="https://img.shields.io/badge/Android_app_%2B_widget-24292f" alt="Android app and widget">
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

Opening the Hoki app shows the full 3D app, bundled inside the APK so it works offline (no website needed). The widget counts its own luck (stored on the phone); the app keeps its own count.

How it works: Android widgets cannot run WebGL, so `tools/make_widget_frames.py` renders the same 3D cat as the web app (`js/cat3d.js`) at 9 poses of one front-to-back beckon, and a `ViewFlipper` plays them as a 16-step eased loop (85 ms per step). The APK is built and published by GitHub Actions (`.github/workflows/android.yml`) on every change under `android/` or the web app; Gradle copies `index.html`, `css/`, `js/` and `assets/` into the APK. It is signed with a deliberately public key (`android/app/hoki-public.p12`) so updates install over each other; it is a sideloaded hobby app, not a Play Store listing.

**iPhone:** Apple only allows home-screen widgets from App Store apps, so on iPhone use Share > *Add to Home Screen* (full-screen, offline).

## Windows app

Paste into PowerShell:

```powershell
irm https://juw12.github.io/hoki/desktop/install.ps1 | iex
```

Or download [Hoki.exe](https://github.com/juw12/hoki/releases/latest/download/Hoki.exe) (one file, about 4 MB, no installer, no admin).

- **Hoki** (Start menu) opens the full app in its own window.
- **Hoki Lucky Cat** puts the live 3D cat on your desktop: transparent, always on top, bottom right. It is the same 3D cat as the web app, not a flipbook, so it waves smoothly, blinks, hops when tapped, gets petted, and **watches your mouse anywhere on the screen**.
- **Click** the cat for luck, **drag** to move it, **right-click** for size (S/M/L), sound, *Open Hoki* and *Hide Hoki*. The *Desktop* button in the app window also puts the cat on your desktop.
- The app window and the desktop cat share one luck count. Only one Hoki runs at a time; starting it again just shows the window you asked for.
- How it works: `app/` is a small [Tauri 2](https://tauri.app) shell (Rust, WebView2) around the same `index.html` + `js/cat3d.js`. `app/src/main.rs` opens the windows and feeds the desktop cursor position to the cat 30 times a second. GitHub Actions (`.github/workflows/windows.yml`) builds `Hoki.exe` and attaches it to the latest release.
- Needs the WebView2 runtime, which ships with Windows 10 and 11. If the download fails, the installer falls back to the older lightweight PowerShell widget (`desktop/hoki-widget.ps1`, 13 pre-rendered frames).
- Files: `%LOCALAPPDATA%\Hoki\Hoki.exe`, `%APPDATA%\io.github.juw12.hoki` (position and size), WebView2 data in `%LOCALAPPDATA%\io.github.juw12.hoki`.
- Uninstall: right-click the cat → *Hide Hoki*, close the app, delete those folders and the two Start menu shortcuts.

Build it yourself: `pwsh app/build.ps1` (needs Rust and the MSVC build tools) → `app/target/release/hoki.exe`.

## Run locally

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1   # http://localhost:8080
python tools/check_web.py                           # smoke test (Playwright + Edge)
powershell -STA -File desktop/hoki-widget.ps1 -Snapshot out.png -SnapshotTaps 8   # render the widget offscreen
powershell -STA -File tools/capture_hoki.ps1                                     # live-capture the on-screen widget -> docs/media/desktop-widget.png
```

`tools/capture_hoki.ps1` grabs the widget as it is actually shown on your desktop (cat + wallpaper behind it) for the README hero. It waits for the desktop to unlock, starts the widget if it is not running, and only falls back to the offscreen `-Snapshot` render when there is no display.

`python tools/make_widget_frames.py` re-renders the Android and Windows widget frames from the 3D model, then `python tools/make_icons.py` rebuilds `assets/icon.svg` and the PNG icons from those frames (needs Pillow, Playwright + Edge). `tools/preview3d.html?fold=0.5` shows the model at any pose.
The look (palette, type, motion, banned defaults) is written down in `design.md`.

## How it's built

| Part | Files |
|---|---|
| Cat (3D) | `js/cat3d.js`: a procedural glazed-ceramic maneki-neko in three.js (`js/vendor/three.module.min.js`, r170, MIT): faces you with big glossy kawaii eyes, calico body, raised arm with a shoulder and a wrist joint, koban coin and bell, sitting on a soft contact shadow (no cushion). It is interactive: eyes and head follow your pointer, it blinks, taps make it hop with happy `^ ^` eyes and an ear flick, stroking its head pets it, and its tail sways. The paw beckons front-to-back like a real maneki-neko: the wrist and shoulder turn about the sideways axis, toward you. Slow GPUs get a lighter render automatically |
| Cat (fallback) | `assets/cat.svg`: the flat vector cat, used when WebGL is unavailable (or with `?flat`) |
| Web / PWA | `index.html`, `css/style.css`, `js/app.js`, `sw.js`, `manifest.webmanifest` |
| Windows app | `app/` (Tauri 2: `src/main.rs`, `tauri.conf.json`, `build.ps1`), `desktop/install.ps1`; legacy widget `desktop/hoki-widget.ps1` + `desktop/frames/` |
| Widget frames | `tools/make_widget_frames.py` (Android `drawable-nodpi/cat_*.png` + `desktop/frames/`) |
| Checks | `tools/check_web.py`, `-Snapshot` mode of the widget |

No build step. The only dependency is three.js, vendored as one file.

For fun. Luck not guaranteed.

## License

MIT
