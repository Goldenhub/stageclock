use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tokio::sync::broadcast;

pub mod mdns;
pub mod server;
pub mod state;

use state::{AppState, ScheduleItem, SharedState, TimerState};

// ─── Tauri commands ──────────────────────────────────────────────────────────

/// Sender used to push state to connected phones.
pub struct WsBroadcast(pub broadcast::Sender<String>);

/// The port the phone remote server is listening on, if it started.
pub struct RemotePort(pub Option<u16>);

/// Apply a change to the timer state, then push the result to every window
/// and every connected phone immediately.
fn mutate(
    app: &tauri::AppHandle,
    state: &SharedState,
    tx: &WsBroadcast,
    f: impl FnOnce(&mut AppState),
) -> Result<(), String> {
    let timer_state = {
        let mut s = state::lock(state);
        f(&mut s);
        server::broadcast_state(&s, &tx.0);
        s.get_timer_state()
    };
    app.emit("timer-state-updated", &timer_state)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn timer_command(
    action: String,
    state: tauri::State<'_, SharedState>,
    tx: tauri::State<'_, WsBroadcast>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let apply: fn(&mut AppState) = match action.as_str() {
        "start" => AppState::start,
        "pause" => AppState::pause,
        "stop" => AppState::stop,
        "reset" => AppState::reset,
        _ => return Err(format!("Unknown action: {action}")),
    };
    mutate(&app, &state, &tx, apply)
}

#[tauri::command]
async fn adjust_timer(
    delta_seconds: i64,
    state: tauri::State<'_, SharedState>,
    tx: tauri::State<'_, WsBroadcast>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    mutate(&app, &state, &tx, |s| s.adjust(delta_seconds))
}

#[tauri::command]
async fn load_item(
    item_id: String,
    duration_seconds: u64,
    label: String,
    direction: Option<String>,
    state: tauri::State<'_, SharedState>,
    tx: tauri::State<'_, WsBroadcast>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    mutate(&app, &state, &tx, |s| {
        s.load_item(item_id, duration_seconds, Some(label), direction)
    })
}

#[tauri::command]
async fn update_active_item(
    item_id: String,
    label: String,
    duration_seconds: u64,
    direction: Option<String>,
    state: tauri::State<'_, SharedState>,
    tx: tauri::State<'_, WsBroadcast>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    mutate(&app, &state, &tx, |s| {
        s.update_active_item(&item_id, label, duration_seconds, direction)
    })
}

#[tauri::command]
async fn get_timer_state(
    state: tauri::State<'_, SharedState>,
) -> Result<TimerState, String> {
    Ok(state::lock(&state).get_timer_state())
}

#[tauri::command]
async fn get_remote_port(port: tauri::State<'_, RemotePort>) -> Result<Option<u16>, String> {
    Ok(port.0)
}

#[tauri::command]
async fn get_local_ip() -> Result<String, String> {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct DisplayInfo {
    index: usize,
    name: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
}

#[tauri::command]
async fn get_displays(app: tauri::AppHandle) -> Result<Vec<DisplayInfo>, String> {
    let window = app
        .get_webview_window("control")
        .ok_or("Control window not found")?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors
        .into_iter()
        .enumerate()
        .map(|(i, m)| {
            let pos = m.position();
            let size = m.size();
            DisplayInfo {
                index: i,
                name: m.name().cloned().unwrap_or_default(),
                width: size.width,
                height: size.height,
                x: pos.x,
                y: pos.y,
            }
        })
        .collect())
}

#[tauri::command]
async fn set_allow_overtime(
    allow: bool,
    state: tauri::State<'_, SharedState>,
    tx: tauri::State<'_, WsBroadcast>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    mutate(&app, &state, &tx, |s| s.allow_overtime = allow)
}

#[tauri::command]
async fn set_schedule(
    name: Option<String>,
    items: Vec<ScheduleItem>,
    state: tauri::State<'_, SharedState>,
    tx: tauri::State<'_, WsBroadcast>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    mutate(&app, &state, &tx, |s| {
        if let Some(n) = name {
            s.schedule_name = n;
        }
        s.schedule_items = items;
    })
}

#[tauri::command]
async fn set_alert_thresholds(
    warning_seconds: u64,
    critical_seconds: u64,
    state: tauri::State<'_, SharedState>,
    tx: tauri::State<'_, WsBroadcast>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    mutate(&app, &state, &tx, |s| {
        s.warning_seconds = warning_seconds;
        s.critical_seconds = critical_seconds;
    })
}

#[tauri::command]
async fn set_pin(
    pin: String,
    state: tauri::State<'_, Arc<tokio::sync::Mutex<String>>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    {
        let mut p = state.lock().await;
        *p = pin.clone();
    }
    save_pin(&app, &pin)?;
    Ok(())
}

#[tauri::command]
async fn set_banner(
    text: Option<String>,
    duration_seconds: Option<u64>,
    state: tauri::State<'_, SharedState>,
    tx: tauri::State<'_, WsBroadcast>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    mutate(&app, &state, &tx, |s| s.set_banner(text, duration_seconds))
}

#[tauri::command]
async fn toggle_display(
    app: tauri::AppHandle,
    monitor_index: Option<usize>,
) -> Result<bool, String> {
    let display = app
        .get_webview_window("display")
        .ok_or("Display window not found")?;
    if display.is_visible().map_err(|e| e.to_string())? {
        display.hide().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        if let Some(idx) = monitor_index {
            let control = app
                .get_webview_window("control")
                .ok_or("Control window not found")?;
            let monitors = control.available_monitors().map_err(|e| e.to_string())?;
            if let Some(monitor) = monitors.get(idx) {
                let pos = monitor.position();
                let size = monitor.size();
                // Position and size to fill the monitor, then show
                display
                    .set_position(tauri::PhysicalPosition::new(pos.x, pos.y))
                    .map_err(|e| e.to_string())?;
                display
                    .set_size(tauri::PhysicalSize::new(size.width, size.height))
                    .map_err(|e| e.to_string())?;
                display.show().map_err(|e| e.to_string())?;
                return Ok(true);
            }
        }
        display.show().map_err(|e| e.to_string())?;
        display.set_focus().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
async fn is_display_visible(app: tauri::AppHandle) -> Result<bool, String> {
    let display = app
        .get_webview_window("display")
        .ok_or("Display window not found")?;
    display.is_visible().map_err(|e| e.to_string())
}

#[tauri::command]
async fn move_display_window_to_monitor(
    monitor_index: usize,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let control = app
        .get_webview_window("control")
        .ok_or("Control window not found")?;
    let monitors = control.available_monitors().map_err(|e| e.to_string())?;

    if let Some(monitor) = monitors.get(monitor_index) {
        let display = app
            .get_webview_window("display")
            .ok_or("Display window not found")?;
        let pos = monitor.position();
        display
            .set_position(tauri::PhysicalPosition::new(pos.x, pos.y))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── PIN persistence ─────────────────────────────────────────────────────────

fn config_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("config.json"))
}

fn load_pin_from_disk(app: &tauri::AppHandle) -> String {
    let path = match config_path(app) {
        Some(p) => p,
        None => return "1234".to_string(),
    };
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("pin")?.as_str().map(String::from))
        .unwrap_or_else(|| "1234".to_string())
}

fn save_pin(app: &tauri::AppHandle, pin: &str) -> Result<(), String> {
    let path = config_path(app).ok_or("Could not resolve config path")?;
    let json = serde_json::json!({ "pin": pin });
    std::fs::write(
        &path,
        serde_json::to_string_pretty(&json).unwrap(),
    )
    .map_err(|e| e.to_string())
}

// ─── App entry ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_state: SharedState = Arc::new(std::sync::Mutex::new(AppState::new()));
    let (ws_broadcast_tx, _) = broadcast::channel::<String>(64);

    // Bind the phone remote port up front so the UI can show the real one.
    let listener = server::bind_listener();
    let remote_port = listener
        .as_ref()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(shared_state.clone())
        .manage(WsBroadcast(ws_broadcast_tx.clone()))
        .manage(RemotePort(remote_port))
        .invoke_handler(tauri::generate_handler![
            timer_command,
            adjust_timer,
            load_item,
            update_active_item,
            get_timer_state,
            set_allow_overtime,
            set_schedule,
            set_alert_thresholds,
            set_pin,
            set_banner,
            toggle_display,
            is_display_visible,
            get_local_ip,
            get_remote_port,
            get_displays,
            move_display_window_to_monitor,
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // Load PIN from disk and register as managed state
            let initial_pin = load_pin_from_disk(&app_handle);
            let pin = Arc::new(tokio::sync::Mutex::new(initial_pin));
            app.manage(pin.clone());

            let tick_state = shared_state.clone();
            let tick_tx = ws_broadcast_tx.clone();

            // ── Tick loop: 100ms window updates, 1s phone resync ─────────────
            // Changes are pushed immediately by the commands; this loop keeps
            // the windows' clocks moving and expires timed banners.
            tauri::async_runtime::spawn(async move {
                let mut tauri_tick = tokio::time::interval(Duration::from_millis(100));
                let mut ws_tick = tokio::time::interval(Duration::from_secs(1));
                tauri_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
                ws_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

                loop {
                    tokio::select! {
                        _ = tauri_tick.tick() => {
                            let ts = {
                                let mut s = state::lock(&tick_state);
                                if s.expire_banner() {
                                    server::broadcast_state(&s, &tick_tx);
                                }
                                s.get_timer_state()
                            };
                            let _ = app_handle.emit("timer-state-updated", &ts);
                        }
                        _ = ws_tick.tick() => {
                            let s = state::lock(&tick_state);
                            server::broadcast_state(&s, &tick_tx);
                        }
                    }
                }
            });

            // ── Phone remote server + mDNS ────────────────────────────────────
            if let (Some(listener), Some(port)) = (listener, remote_port) {
                let server_state = shared_state.clone();
                let server_tx = ws_broadcast_tx.clone();
                tauri::async_runtime::spawn(async move {
                    server::start_server(listener, server_state, server_tx, pin).await;
                });

                if let Ok(ip) = local_ip_address::local_ip() {
                    mdns::advertise(&ip.to_string(), port);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
