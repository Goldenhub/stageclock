use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, State,
    },
    http::header,
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use serde::Deserialize;
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::broadcast;

use crate::persist::Persistence;
use crate::remote_auth::{AuthResult, RemoteAuth};
use crate::state::{self, AppState, SharedState};

/// A connection that hasn't paired within this time is dropped.
const AUTH_TIMEOUT: Duration = Duration::from_secs(10);

// Mobile HTML is embedded at compile time.
const MOBILE_HTML: &str = include_str!("../../src/mobile/index.html");
const LOGO_BYTES: &[u8] = include_bytes!("../../src/assets/logo.png");

/// Ports tried in order for the phone remote server.
pub const PORT_CANDIDATES: std::ops::RangeInclusive<u16> = 3000..=3010;

pub struct ServerState {
    pub timer_state: SharedState,
    pub broadcast_tx: broadcast::Sender<String>,
    pub auth: Arc<RemoteAuth>,
    pub persistence: Persistence,
}

pub type SharedServerState = Arc<ServerState>;

#[derive(Debug, Deserialize)]
struct WsCommand {
    #[serde(rename = "type")]
    cmd_type: String,
    token: Option<String>,
    delta: Option<i64>,
    id: Option<String>,
    duration: Option<u64>,
    label: Option<String>,
    direction: Option<String>,
    text: Option<String>,
}

/// Build the STATE and SCHEDULE messages sent to phones.
pub fn state_messages(s: &AppState) -> [String; 2] {
    let ts = s.get_timer_state();
    let schedule: Vec<_> = s
        .schedule_items
        .iter()
        .map(|item| {
            serde_json::json!({
                "id": item.id,
                "label": item.label,
                "duration_seconds": item.duration_seconds,
                "direction": item.direction,
            })
        })
        .collect();
    let state_json = serde_json::json!({
        "type": "STATE",
        "elapsed_ms": ts.elapsed_ms,
        "duration_ms": ts.duration_ms,
        "running": ts.running,
        "direction": ts.direction,
        "label": ts.label,
        "overtime": ts.overtime,
        "allow_overtime": ts.allow_overtime,
        "active_item_id": ts.active_item_id,
        "banner_text": ts.banner_text,
        "warning_seconds": ts.warning_seconds,
        "critical_seconds": ts.critical_seconds,
    });
    let schedule_json = serde_json::json!({
        "type": "SCHEDULE",
        "name": s.schedule_name,
        "items": schedule,
        "active_item_id": ts.active_item_id,
    });
    [state_json.to_string(), schedule_json.to_string()]
}

/// Push the current state to every connected phone right away.
pub fn broadcast_state(s: &AppState, tx: &broadcast::Sender<String>) {
    for msg in state_messages(s) {
        let _ = tx.send(msg);
    }
}

/// Bind the first free port from `PORT_CANDIDATES`. Done synchronously at
/// startup so the UI can report the real port (or that none was free).
pub fn bind_listener() -> Option<std::net::TcpListener> {
    for port in PORT_CANDIDATES {
        match std::net::TcpListener::bind(("0.0.0.0", port)) {
            Ok(l) => {
                if l.set_nonblocking(true).is_ok() {
                    return Some(l);
                }
            }
            Err(e) => eprintln!("Port {port} unavailable: {e}"),
        }
    }
    eprintln!("Phone remote disabled: no free port in {PORT_CANDIDATES:?}");
    None
}

pub async fn start_server(listener: std::net::TcpListener, server_state: ServerState) {
    let server_state = Arc::new(server_state);

    let app = Router::new()
        .route("/mobile", get(mobile_handler))
        .route("/logo", get(logo_handler))
        .route("/ws", get(ws_handler))
        .with_state(server_state);

    let listener = match tokio::net::TcpListener::from_std(listener) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to start phone remote server: {e}");
            return;
        }
    };

    if let Ok(addr) = listener.local_addr() {
        println!("Remote server listening on http://{addr}");
    }

    // Connect info gives each socket its peer address, for the lockout.
    let service = app.into_make_service_with_connect_info::<SocketAddr>();
    if let Err(e) = axum::serve(listener, service).await {
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
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<SharedServerState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state, addr.ip()))
}

fn json_msg(v: serde_json::Value) -> Message {
    Message::Text(v.to_string())
}

async fn handle_socket(mut socket: WebSocket, state: SharedServerState, ip: IpAddr) {
    // ── 1. Pairing: the first message must carry the right token ───────────
    let first = tokio::time::timeout(AUTH_TIMEOUT, socket.recv()).await;
    let token = match first {
        Ok(Some(Ok(Message::Text(text)))) => serde_json::from_str::<WsCommand>(&text)
            .ok()
            .filter(|c| c.cmd_type == "AUTH")
            .and_then(|c| c.token),
        _ => None,
    };
    let result = match &token {
        Some(t) => state.auth.check(ip, t, Instant::now()),
        None => AuthResult::Denied,
    };
    match result {
        AuthResult::Ok => {}
        AuthResult::Denied => {
            let _ = socket.send(json_msg(serde_json::json!({"type": "AUTH_FAIL"}))).await;
            return;
        }
        AuthResult::LockedOut => {
            let _ = socket
                .send(json_msg(serde_json::json!({"type": "LOCKED_OUT", "retry_after_s": crate::remote_auth::LOCKOUT.as_secs()})))
                .await;
            return;
        }
    }

    // ── 2. Paired: send current state, then relay commands and broadcasts ──
    let _guard = state.auth.track_connection();
    let mut revoked = state.auth.subscribe_revocations();
    let mut rx = state.broadcast_tx.subscribe();

    let _ = socket.send(json_msg(serde_json::json!({"type": "AUTH_OK"}))).await;
    let msgs = state_messages(&state::lock(&state.timer_state));
    for json in msgs {
        let _ = socket.send(Message::Text(json)).await;
    }

    loop {
        tokio::select! {
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(cmd) = serde_json::from_str::<WsCommand>(&text) {
                            handle_ws_command(&cmd, &state);
                        }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => {}
                }
            }
            broadcast = rx.recv() => {
                match broadcast {
                    Ok(msg) => {
                        if socket.send(Message::Text(msg)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
            // The operator pressed "Disconnect all phones".
            _ = revoked.changed() => {
                let _ = socket.send(json_msg(serde_json::json!({"type": "REVOKED"}))).await;
                let _ = socket.send(Message::Close(None)).await;
                break;
            }
        }
    }
}

/// How long a banner sent from the phone stays up before the server clears it.
const PHONE_BANNER_SECONDS: u64 = 30;

fn handle_ws_command(cmd: &WsCommand, state: &SharedServerState) {
    let mut s = state::lock(&state.timer_state);

    match cmd.cmd_type.as_str() {
        "START" => s.start(),
        "PAUSE" => s.pause(),
        "STOP" => s.stop(),
        "RESET" => s.reset(),
        "ADJUST" => {
            if let Some(delta) = cmd.delta {
                s.adjust(delta);
            }
        }
        "LOAD_ITEM" => {
            if let (Some(id), Some(duration)) = (cmd.id.clone(), cmd.duration) {
                s.load_item(id, duration, cmd.label.clone(), cmd.direction.clone());
            }
        }
        "SET_BANNER" => {
            // The server owns the timeout so a locked phone can't leave a
            // banner stuck on the stage display.
            let duration = cmd.duration.unwrap_or(PHONE_BANNER_SECONDS);
            s.set_banner(cmd.text.clone(), Some(duration));
        }
        _ => return,
    }

    broadcast_state(&s, &state.broadcast_tx);
    state.persistence.save(&s);
}
