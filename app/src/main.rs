// Hoki for Windows: the full app in its own window, plus the live 3D desktop cat.
//
// The cat is the same web app (index.html, js/cat3d.js) bundled into the exe, so the desktop cat waves,
// blinks, hops, gets petted and follows the mouse exactly like the page, instead of flipping pre-rendered
// frames. `hoki.exe` opens the app window; `hoki.exe --widget` starts with only the desktop cat.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};

const MAIN: &str = "main";
const WIDGET: &str = "widget";

/// Desktop cat sizes (logical px): small, medium, large. Taller than wide so the count pill fits below.
const WIDGET_SIZES: [(f64, f64); 3] = [(170.0, 196.0), (220.0, 254.0), (290.0, 334.0)];
const DEFAULT_SIZE: usize = 1;

/// Where the desktop cat sits and how big it is, kept in the app's config folder.
struct WidgetSettings {
    position: Option<(i32, i32)>,
    size: usize,
}

fn settings_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("widget.txt"))
}

fn load_settings(app: &AppHandle) -> WidgetSettings {
    let mut settings = WidgetSettings { position: None, size: DEFAULT_SIZE };
    let Some(text) = settings_file(app).and_then(|path| fs::read_to_string(path).ok()) else {
        return settings;
    };
    let numbers: Vec<i64> = text.split_whitespace().filter_map(|part| part.parse().ok()).collect();
    if numbers.len() == 3 {
        settings.position = Some((numbers[0] as i32, numbers[1] as i32));
        settings.size = (numbers[2].max(0) as usize).min(WIDGET_SIZES.len() - 1);
    }
    settings
}

fn save_settings(app: &AppHandle, settings: &WidgetSettings) {
    let Some(path) = settings_file(app) else {
        return;
    };
    let Some((x, y)) = settings.position else {
        return;
    };
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let _ = fs::write(path, format!("{x} {y} {}", settings.size));
}

fn open_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title("Hoki")
        .inner_size(1120.0, 780.0)
        .min_inner_size(360.0, 560.0)
        .center()
        .initialization_script("window.HOKI_NATIVE = 'app';")
        .build();
}

fn open_widget_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WIDGET) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let settings = load_settings(app);
    let (width, height) = WIDGET_SIZES[settings.size];
    let built = WebviewWindowBuilder::new(app, WIDGET, WebviewUrl::App("index.html".into()))
        .title("Hoki")
        .inner_size(width, height)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .initialization_script("window.HOKI_NATIVE = 'widget';")
        .build();
    let Ok(window) = built else {
        return;
    };
    let position = settings.position.or_else(|| default_corner(&window, width, height));
    if let Some((x, y)) = position {
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
    let _ = window.show();
}

/// Bottom-right of the primary screen, just above the taskbar.
fn default_corner(window: &WebviewWindow, width: f64, height: f64) -> Option<(i32, i32)> {
    let monitor = window.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let origin = monitor.position();
    let size = monitor.size();
    let x = origin.x + size.width as i32 - (width * scale) as i32 - (24.0 * scale) as i32;
    let y = origin.y + size.height as i32 - (height * scale) as i32 - (64.0 * scale) as i32;
    Some((x, y))
}

#[tauri::command]
async fn open_app(app: AppHandle) {
    open_main_window(&app);
}

#[tauri::command]
async fn open_widget(app: AppHandle) {
    open_widget_window(&app);
}

#[tauri::command]
fn close_widget(app: AppHandle) {
    if let Some(window) = app.get_webview_window(WIDGET) {
        let _ = window.close();
    }
}

#[tauri::command]
fn widget_drag(window: WebviewWindow) {
    let _ = window.start_dragging();
}

#[tauri::command]
fn widget_size(app: AppHandle, size: usize) {
    let size = size.min(WIDGET_SIZES.len() - 1);
    let Some(window) = app.get_webview_window(WIDGET) else {
        return;
    };
    let (width, height) = WIDGET_SIZES[size];
    // Grow or shrink around the bottom edge so Hoki stays standing in the same spot.
    let before = window.outer_size().ok();
    let _ = window.set_size(LogicalSize::new(width, height));
    if let (Some(before), Ok(origin), Ok(after)) = (before, window.outer_position(), window.outer_size()) {
        let x = origin.x + (before.width as i32 - after.width as i32) / 2;
        let y = origin.y + before.height as i32 - after.height as i32;
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
    let mut settings = load_settings(&app);
    settings.size = size;
    if let Ok(origin) = window.outer_position() {
        settings.position = Some((origin.x, origin.y));
    }
    save_settings(&app, &settings);
}

/// Feed the desktop cursor to the cat (relative to its window) so Hoki watches the mouse anywhere.
fn follow_cursor(app: AppHandle) {
    thread::spawn(move || {
        let mut last = (f64::NAN, f64::NAN);
        let mut last_sent = Instant::now();
        loop {
            thread::sleep(Duration::from_millis(33));
            let Some(window) = app.get_webview_window(WIDGET) else {
                continue;
            };
            let (Ok(cursor), Ok(origin), Ok(size)) =
                (window.cursor_position(), window.outer_position(), window.outer_size())
            else {
                continue;
            };
            if size.width == 0 || size.height == 0 {
                continue;
            }
            let x = ((cursor.x - origin.x as f64) / size.width as f64 - 0.5) * 2.0;
            let y = ((cursor.y - origin.y as f64) / size.height as f64 - 0.5) * 2.0;
            let moved = (x - last.0).abs() > 0.002 || (y - last.1).abs() > 0.002;
            if !moved && last_sent.elapsed() < Duration::from_millis(900) {
                continue;
            }
            last = (x, y);
            last_sent = Instant::now();
            let _ = window.eval(&format!("window.hokiCursor && window.hokiCursor({x:.3}, {y:.3});"));
        }
    });
}

fn main() {
    let widget_only = std::env::args().any(|arg| arg == "--widget");
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_app, open_widget, close_widget, widget_drag, widget_size])
        .on_window_event(|window, event| {
            if window.label() != WIDGET {
                return;
            }
            if let WindowEvent::Moved(position) = event {
                let app = window.app_handle();
                let mut settings = load_settings(app);
                settings.position = Some((position.x, position.y));
                save_settings(app, &settings);
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            if widget_only {
                open_widget_window(&handle);
            } else {
                open_main_window(&handle);
            }
            follow_cursor(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Hoki could not start");
}
