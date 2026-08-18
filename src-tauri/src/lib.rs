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

#[tauri::command]
async fn timer_command(
    action: String,
    state: tauri::State<'_, SharedState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let timer_state = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        match action.as_str() {
            "start" => {
                if !s.running {
                    s.elapsed_at_snapshot = s.current_elapsed_ms();
                    s.start_instant = Some(std::time::Instant::now());
                    s.running = true;
                }
            }
            "pause" => {
                if s.running {
                    s.elapsed_at_snapshot = s.current_elapsed_ms();
                    s.start_instant = None;
                    s.running = false;
                }
            }
            "stop" => {
                s.elapsed_at_snapshot = if s.direction == "down" {
                    s.duration_ms as i64
                } else {
                    0
                };
                s.start_instant = None;
                s.running = false;
            }
            "reset" => {
                let reset_val = if s.direction == "down" {
                    s.duration_ms as i64
                } else {
                    0
                };
                s.elapsed_at_snapshot = reset_val;
                if s.running {
                    s.start_instant = Some(std::time::Instant::now());
                }
            }
            _ => return Err(format!("Unknown action: {action}")),
        }
        s.get_timer_state()
    };
    app.emit("timer-state-updated", &timer_state)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn adjust_timer(
    delta_seconds: i64,
    state: tauri::State<'_, SharedState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let timer_state = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        let current = s.current_elapsed_ms();
        let new_val = (current + delta_seconds * 1000).max(0);
        s.elapsed_at_snapshot = new_val;
        if s.running {
            s.start_instant = Some(std::time::Instant::now());
        }
        s.get_timer_state()
    };
    app.emit("timer-state-updated", &timer_state)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn load_item(
    item_id: String,
    duration_seconds: u64,
    label: String,
    direction: Option<String>,
    state: tauri::State<'_, SharedState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let timer_state = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        let duration_ms = duration_seconds * 1000;
        s.duration_ms = duration_ms;
        s.direction = direction.unwrap_or_else(|| "down".to_string());
        s.active_item_id = Some(item_id);
        s.label = Some(label);
        s.running = false;
        s.start_instant = None;
        s.elapsed_at_snapshot = duration_ms as i64;
        s.get_timer_state()
    };
    app.emit("timer-state-updated", &timer_state)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_timer_state(
    state: tauri::State<'_, SharedState>,
) -> Result<TimerState, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(s.get_timer_state())
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
    app: tauri::AppHandle,
) -> Result<(), String> {
    let timer_state = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.allow_overtime = allow;
        s.get_timer_state()
    };
    app.emit("timer-state-updated", &timer_state)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn set_schedule(
    name: Option<String>,
    items: Vec<ScheduleItem>,
    state: tauri::State<'_, SharedState>,
) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    if let Some(n) = name {
        s.schedule_name = n;
    }
    s.schedule_items = items;
    Ok(())
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
    state: tauri::State<'_, SharedState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let timer_state = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.banner_text = text;
        s.get_timer_state()
    };
    app.emit("timer-state-updated", &timer_state)
        .map_err(|e| e.to_string())?;
    Ok(())
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
        display.set_fullscreen(true).map_err(|e| e.to_string())?;
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

    // Clones for setup closure
    let server_state = shared_state.clone();
    let server_tx = ws_broadcast_tx.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(shared_state)
        .invoke_handler(tauri::generate_handler![
            timer_command,
            adjust_timer,
            load_item,
            get_timer_state,
            set_allow_overtime,
            set_schedule,
            set_pin,
            set_banner,
            get_local_ip,
            get_displays,
            move_display_window_to_monitor,
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // Load PIN from disk and register as managed state
            let initial_pin = load_pin_from_disk(&app_handle);
            let pin = Arc::new(tokio::sync::Mutex::new(initial_pin));
            app.manage(pin.clone());

            let server_pin = pin.clone();

            let tick_state = app.state::<SharedState>().inner().clone();
            let tick_tx = ws_broadcast_tx.clone();

            // ── Tick loop: 100ms Tauri events + 1s WebSocket broadcast ────────
            tauri::async_runtime::spawn(async move {
                let mut tauri_tick = tokio::time::interval(Duration::from_millis(100));
                let mut ws_tick = tokio::time::interval(Duration::from_secs(1));
                // Don't let missed ticks pile up
                tauri_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
                ws_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

                loop {
                    tokio::select! {
                        _ = tauri_tick.tick() => {
                            let ts = tick_state.lock().unwrap().get_timer_state();
                            let _ = app_handle.emit("timer-state-updated", &ts);
                        }
                        _ = ws_tick.tick() => {
                            let state_guard = tick_state.lock().unwrap();
                            let ts = state_guard.get_timer_state();
                            let schedule: Vec<_> = state_guard.schedule_items.iter().map(|item| {
                                serde_json::json!({
                                    "id": item.id,
                                    "label": item.label,
                                    "duration_seconds": item.duration_seconds,
                                    "direction": item.direction,
                                })
                            }).collect();
                            let active_id = ts.active_item_id.clone();
                            let schedule_name = state_guard.schedule_name.clone();
                            drop(state_guard);

                            let payload = serde_json::json!({
                                "type": "STATE",
                                "elapsed_ms": ts.elapsed_ms,
                                "duration_ms": ts.duration_ms,
                                "running": ts.running,
                                "direction": ts.direction,
                                "label": ts.label,
                                "overtime": ts.overtime,
                                "allow_overtime": ts.allow_overtime,
                                "active_item_id": active_id,
                                "banner_text": ts.banner_text,
                            });
                            if let Ok(json) = serde_json::to_string(&payload) {
                                let _ = tick_tx.send(json);
                            }
                            let sched_payload = serde_json::json!({
                                "type": "SCHEDULE",
                                "name": schedule_name,
                                "items": schedule,
                                "active_item_id": active_id,
                            });
                            if let Ok(json) = serde_json::to_string(&sched_payload) {
                                let _ = tick_tx.send(json);
                            }
                        }
                    }
                }
            });

            // ── axum server ───────────────────────────────────────────────────
            tauri::async_runtime::spawn(async move {
                server::start_server(server_state, server_tx, server_pin).await;
            });

            // ── Auto-move display to second monitor on startup ────────────────
            let ah = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(800)).await;
                if let Some(control) = ah.get_webview_window("control") {
                    if let Ok(monitors) = control.available_monitors() {
                        if monitors.len() > 1 {
                            if let Some(display) = ah.get_webview_window("display") {
                                let pos = monitors[1].position();
                                let _ = display.set_position(
                                    tauri::PhysicalPosition::new(pos.x, pos.y),
                                );
                                let _ = display.set_fullscreen(true);
                            }
                        }
                    }
                }
            });

            // ── mDNS advertisement ────────────────────────────────────────────
            if let Ok(ip) = local_ip_address::local_ip() {
                mdns::advertise(&ip.to_string(), 3000);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
