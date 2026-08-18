use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::header,
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::broadcast;

use crate::state::SharedState;

// Mobile HTML is embedded at compile time.
const MOBILE_HTML: &str = include_str!("../../src/mobile/index.html");
const LOGO_BYTES: &[u8] = include_bytes!("../../src/assets/logo.png");

pub struct ServerState {
    pub timer_state: SharedState,
    pub broadcast_tx: broadcast::Sender<String>,
    pub pin: Arc<tokio::sync::Mutex<String>>,
}

pub type SharedServerState = Arc<ServerState>;

#[derive(Debug, Deserialize)]
struct WsCommand {
    #[serde(rename = "type")]
    cmd_type: String,
    pin: Option<String>,
    delta: Option<i64>,
    id: Option<String>,
    duration: Option<u64>,
    label: Option<String>,
    direction: Option<String>,
    text: Option<String>,
}

pub async fn start_server(
    timer_state: SharedState,
    broadcast_tx: broadcast::Sender<String>,
    pin: Arc<tokio::sync::Mutex<String>>,
) {
    let server_state = Arc::new(ServerState {
        timer_state,
        broadcast_tx,
        pin,
    });

    let app = Router::new()
        .route("/mobile", get(mobile_handler))
        .route("/logo", get(logo_handler))
        .route("/ws", get(ws_handler))
        .with_state(server_state);

    let listener = match tokio::net::TcpListener::bind("0.0.0.0:3000").await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind server on port 3000: {e}");
            return;
        }
    };

    println!("Remote server listening on http://0.0.0.0:3000");

    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("Server error: {e}");
    }
}

async fn mobile_handler() -> Html<&'static str> {
    Html(MOBILE_HTML)
}

async fn logo_handler() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "image/png"), (header::CACHE_CONTROL, "public, max-age=86400")],
        LOGO_BYTES,
    )
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<SharedServerState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: SharedServerState) {
    let mut authenticated = false;
    let mut rx = state.broadcast_tx.subscribe();

    loop {
        tokio::select! {
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(cmd) = serde_json::from_str::<WsCommand>(&text) {
                            match cmd.cmd_type.as_str() {
                                "AUTH" => {
                                    let correct_pin = state.pin.lock().await.clone();
                                    if cmd.pin.as_deref() == Some(&correct_pin) {
                                        authenticated = true;
                                        let resp = serde_json::json!({"type": "AUTH_OK"}).to_string();
                                        let _ = socket.send(Message::Text(resp.into())).await;
                                        // Extract state data, then drop the guard before awaits
                                        let (state_json, schedule_json) = {
                                            let state_guard = state.timer_state.lock().unwrap();
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
                                            let state_json = serde_json::json!({
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
                                            let schedule_name = state_guard.schedule_name.clone();
                                            let schedule_json = serde_json::json!({
                                                "type": "SCHEDULE",
                                                "name": schedule_name,
                                                "items": schedule,
                                                "active_item_id": active_id,
                                            });
                                            (state_json, schedule_json)
                                        };
                                        if let Ok(json) = serde_json::to_string(&state_json) {
                                            let _ = socket.send(Message::Text(json.into())).await;
                                        }
                                        if let Ok(json) = serde_json::to_string(&schedule_json) {
                                            let _ = socket.send(Message::Text(json.into())).await;
                                        }
                                    } else {
                                        let resp = serde_json::json!({"type": "AUTH_FAIL"}).to_string();
                                        let _ = socket.send(Message::Text(resp.into())).await;
                                    }
                                }
                                _ if authenticated => {
                                    handle_ws_command(&cmd, &state);
                                }
                                _ => {}
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
            broadcast = rx.recv() => {
                match broadcast {
                    Ok(msg) => {
                        if authenticated {
                            if socket.send(Message::Text(msg.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
        }
    }
}

fn handle_ws_command(cmd: &WsCommand, state: &SharedServerState) {
    let mut app_state = match state.timer_state.lock() {
        Ok(s) => s,
        Err(_) => return,
    };

    match cmd.cmd_type.as_str() {
        "START" => {
            if !app_state.running {
                app_state.start_instant = Some(std::time::Instant::now());
                app_state.running = true;
            }
        }
        "PAUSE" => {
            if app_state.running {
                app_state.elapsed_at_snapshot = app_state.current_elapsed_ms();
                app_state.start_instant = None;
                app_state.running = false;
            }
        }
        "STOP" => {
            let reset_val = if app_state.direction == "down" {
                app_state.duration_ms as i64
            } else {
                0
            };
            app_state.elapsed_at_snapshot = reset_val;
            app_state.start_instant = None;
            app_state.running = false;
        }
        "RESET" => {
            let reset_val = if app_state.direction == "down" {
                app_state.duration_ms as i64
            } else {
                0
            };
            app_state.elapsed_at_snapshot = reset_val;
            if app_state.running {
                app_state.start_instant = Some(std::time::Instant::now());
            } else {
                app_state.start_instant = None;
            }
        }
        "ADJUST" => {
            if let Some(delta) = cmd.delta {
                let current = app_state.current_elapsed_ms();
                let new_val = if app_state.direction == "down" {
                    (current + delta * 1000).max(0)
                } else {
                    (current + delta * 1000).max(0)
                };
                app_state.elapsed_at_snapshot = new_val;
                if app_state.running {
                    app_state.start_instant = Some(std::time::Instant::now());
                }
            }
        }
        "LOAD_ITEM" => {
            if let (Some(id), Some(duration)) = (cmd.id.clone(), cmd.duration) {
                let duration_ms = duration * 1000;
                app_state.duration_ms = duration_ms;
                app_state.direction = cmd.direction.clone().unwrap_or_else(|| "down".to_string());
                app_state.active_item_id = Some(id);
                app_state.label = cmd.label.clone();
                app_state.running = false;
                app_state.start_instant = None;
                app_state.elapsed_at_snapshot = duration_ms as i64;
            }
        }
        "SET_BANNER" => {
            app_state.banner_text = cmd.text.clone();
        }
        _ => {}
    }
}
