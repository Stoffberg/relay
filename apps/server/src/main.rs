mod agent_loop;
mod history;
mod module_bindings;
mod prompts;
mod state;
mod streaming;
mod telemetry;
mod tools;

use anyhow::Result;
use axum::{
    extract::{DefaultBodyLimit, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use module_bindings::agent_table::AgentTableAccess;
use module_bindings::append_message_part_reducer::append_message_part;
use module_bindings::create_session_reducer::create_session;
use module_bindings::message_part_table::MessagePartTableAccess;
use module_bindings::message_table::MessageTableAccess;
use module_bindings::send_message_reducer::send_message;
use module_bindings::session_table::SessionTableAccess;
use module_bindings::tool_command_table::ToolCommandTableAccess;
use module_bindings::update_session_title_reducer::update_session_title;
use module_bindings::update_tool_command_status_reducer::update_tool_command_status;
use module_bindings::DbConnection;

use spacetimedb_sdk::{DbContext, Table, TableWithPrimaryKey};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::oneshot;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::set_header::SetResponseHeaderLayer;
use tracing::info;

use module_bindings::complete_message_reducer::complete_message;
use module_bindings::delete_message_reducer::delete_message;
use module_bindings::reap_stale_agents_reducer::reap_stale_agents;
use module_bindings::update_message_content_reducer::update_message_content;
use module_bindings::update_session_model_reducer::update_session_model;
use module_bindings::update_session_status_reducer::update_session_status;
use state::{
    AppState, ChatRequest, ChatResponse, EditRequest, QueuedMessage, RegenerateRequest,
    StopRequest,
};



#[tokio::main]
async fn main() -> Result<()> {
    {
        use tracing_subscriber::layer::SubscriberExt;
        use tracing_subscriber::util::SubscriberInitExt;
        use tracing_subscriber::EnvFilter;

        let filter = EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("relay_server=info,warn"));

        let fmt_layer = tracing_subscriber::fmt::layer();
        let registry = tracing_subscriber::registry().with(filter).with(fmt_layer);

        if let Some(axiom_layer) = telemetry::try_init_axiom() {
            registry.with(axiom_layer).init();
        } else {
            registry.init();
        }
    }

    let spacetime_host = std::env::var("SPACETIME_HOST")
        .unwrap_or_else(|_| "https://maincloud.spacetimedb.com".to_string());
    let spacetime_db = std::env::var("SPACETIME_DB").unwrap_or_else(|_| "relay".to_string());

    info!("Connecting to SpacetimeDB at {spacetime_host}, database: {spacetime_db}");

    let (ready_tx, ready_rx) = oneshot::channel::<()>();
    let ready_tx = std::sync::Mutex::new(Some(ready_tx));
    let db_connected = Arc::new(AtomicBool::new(false));

    let agent_heartbeat_observed: Arc<std::sync::Mutex<HashMap<String, std::time::Instant>>> =
        Arc::new(std::sync::Mutex::new(HashMap::new()));

    let db_connected_on = db_connected.clone();
    let db_connected_off = db_connected.clone();
    let conn = DbConnection::builder()
        .with_uri(&spacetime_host)
        .with_database_name(&spacetime_db)
        .on_connect(move |_conn, identity, _token| {
            info!("Connected to SpacetimeDB as {identity}");
            db_connected_on.store(true, Ordering::SeqCst);
        })
        .on_disconnect(move |_ctx, err| {
            tracing::error!("Disconnected from SpacetimeDB: {err:?}");
            db_connected_off.store(false, Ordering::SeqCst);
        })
        .build()
        .map_err(|e| anyhow::anyhow!("Failed to connect to SpacetimeDB at {spacetime_host}: {e}"))?;

    let heartbeat_map = agent_heartbeat_observed.clone();
    conn.db.agent().on_update(move |_ctx, old, new| {
        if old.last_heartbeat != new.last_heartbeat {
            heartbeat_map
                .lock()
                .unwrap()
                .insert(new.id.clone(), std::time::Instant::now());
        }
    });

    let heartbeat_map_insert = agent_heartbeat_observed.clone();
    conn.db.agent().on_insert(move |_ctx, row| {
        if row.status == "online" {
            heartbeat_map_insert
                .lock()
                .unwrap()
                .insert(row.id.clone(), std::time::Instant::now());
        }
    });

    let sub_handle = conn.subscription_builder()
        .on_applied(move |ctx| {
            let msg_count = ctx.db.message().count();
            let session_count = ctx.db.session().count();
            info!("Subscription applied: {session_count} sessions, {msg_count} messages in cache");
            if let Some(tx) = ready_tx.lock().unwrap().take() {
                let _ = tx.send(());
            }
        })
        .on_error(|_ctx, err| {
            tracing::error!("Subscription error: {err}");
        })
        .subscribe([
            "SELECT * FROM message",
            "SELECT * FROM message_part",
            "SELECT * FROM session",
            "SELECT * FROM tool_command",
            "SELECT * FROM tool_result",
            "SELECT * FROM agent",
        ]);

    let ws_thread = conn.run_threaded();

    info!("Waiting for subscription to be applied...");
    tokio::time::timeout(std::time::Duration::from_secs(30), ready_rx)
        .await
        .map_err(|_| anyhow::anyhow!("Timed out waiting for SpacetimeDB subscription (30s)"))?
        .map_err(|_| anyhow::anyhow!("Subscription channel closed unexpectedly"))?;
    info!("SpacetimeDB client cache ready");

    let sessions_with_queued: HashSet<String> = conn
        .db
        .message()
        .iter()
        .filter(|m| m.role == "user" && m.status == "queued")
        .map(|m| m.session_id.clone())
        .collect();

    let stale_sessions: Vec<String> = conn
        .db
        .session()
        .iter()
        .filter(|s| s.status != "idle" || sessions_with_queued.contains(&s.id))
        .map(|s| s.id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    if !stale_sessions.is_empty() {
        info!(
            "Found {} stale session(s) to recover on startup ({} with queued messages)",
            stale_sessions.len(),
            sessions_with_queued.len()
        );
    }

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let llm_temperature: f32 = std::env::var("OPENROUTER_TEMPERATURE")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.7);
    let llm_max_tokens: u32 = std::env::var("OPENROUTER_MAX_TOKENS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(4096);

    let fallback_model = std::env::var("OPENROUTER_FALLBACK_MODEL").ok();
    let exploration_model = std::env::var("OPENROUTER_EXPLORATION_MODEL").ok();

    let state = Arc::new(AppState {
        openrouter_key: std::env::var("OPENROUTER_API_KEY").expect("OPENROUTER_API_KEY required"),
        openrouter_model: std::env::var("OPENROUTER_MODEL")
            .unwrap_or_else(|_| "minimax/minimax-m2.5:nitro".to_string()),
        exploration_model,
        fallback_model,
        api_key: std::env::var("RELAY_API_KEY").expect("RELAY_API_KEY required"),
        service_key: std::env::var("SERVICE_KEY").ok(),
        http: reqwest::Client::new(),
        conn,
        active_sessions: std::sync::Mutex::new(HashMap::new()),
        cancel_tokens: std::sync::Mutex::new(HashMap::new()),
        global_request_count: AtomicU64::new(0),
        global_window_start: AtomicU64::new(now_secs),
        llm_temperature,
        llm_max_tokens,
        db_connected,
        started_at: std::time::Instant::now(),
        agent_heartbeat_observed,
        _subscription_handle: sub_handle,
        _ws_thread: ws_thread,
    });

    for sid in &stale_sessions {
        let has_queued = sessions_with_queued.contains(sid);
        if !has_queued {
            info!("Resetting stale session to idle: {sid}");
            if let Err(e) = state
                .conn
                .reducers
                .update_session_status(sid.clone(), "idle".to_string())
            {
                tracing::warn!("Failed to reset stale session {sid}: {e}");
            }
            for msg in state.conn.db.message().iter() {
                if msg.session_id == *sid && msg.status == "streaming" {
                    let _ = state.conn.reducers.complete_message(msg.id.clone());
                }
            }
            continue;
        }

        info!("Recovering stale session with queued messages: {sid}");
        
        let owner_token = state
            .conn
            .db
            .session()
            .id()
            .find(sid)
            .map(|s| s.owner_token.clone())
            .unwrap_or_default();

        let (tx, rx) = tokio::sync::mpsc::channel::<QueuedMessage>(16);

        let mut queued: Vec<_> = state
            .conn
            .db
            .message()
            .iter()
            .filter(|m| m.session_id == *sid && m.role == "user" && m.status == "queued")
            .collect();
        queued.sort_by_key(|m| m.created_at);

        for msg in &queued {
            let mut parts: Vec<_> = state
                .conn
                .db
                .message_part()
                .iter()
                .filter(|p| p.message_id == msg.id)
                .collect();
            parts.sort_by_key(|p| p.part_index);
            let content: String = parts.iter().map(|p| p.content.as_str()).collect();
            if !content.is_empty() {
                let _ = tx.try_send(QueuedMessage {
                    id: msg.id.clone(),
                    content,
                    owner_token: owner_token.clone(),
                    model: None,
                });
            }
        }

        let state_clone = state.clone();
        let sid_clone = sid.clone();
        state
            .active_sessions
            .lock()
            .unwrap()
            .insert(sid.clone(), tx);
        tokio::spawn(async move {
            agent_loop::run_session_queue(&state_clone, &sid_clone, rx).await;
        });
    }

    let app = Router::new()
        .route("/health", axum::routing::get(health))
        .route("/chat", post(chat_handler))
        .route("/stop", post(stop_handler))
        .route("/regenerate", post(regenerate_handler))
        .route("/edit", post(edit_handler))
        .route("/service/echo", post(service_echo_handler))
        .layer(DefaultBodyLimit::max(100 * 1024))
        .layer({
            let origins: Vec<HeaderValue> = std::env::var("CORS_ALLOWED_ORIGINS")
                .unwrap_or_else(|_| "https://code.stoff.dev".to_string())
                .split(',')
                .filter_map(|s| s.trim().parse().ok())
                .collect();
            CorsLayer::new()
                .allow_origin(AllowOrigin::list(origins))
                .allow_methods([axum::http::Method::GET, axum::http::Method::POST, axum::http::Method::OPTIONS])
                .allow_headers([axum::http::header::CONTENT_TYPE, axum::http::header::AUTHORIZATION])
        })
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=31536000; includeSubDomains"),
        ))
        .with_state(state.clone());

    {
        let reaper_state = state.clone();
        tokio::spawn(async move {
            const REAP_INTERVAL_SECS: u64 = 60;
            const STALE_THRESHOLD_SECS: u32 = 90;
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(REAP_INTERVAL_SECS)).await;
                if let Err(e) = reaper_state.conn.reducers.reap_stale_agents(STALE_THRESHOLD_SECS) {
                    tracing::warn!("Agent reaper failed: {e}");
                }
            }
        });
        info!("Agent reaper started (every 60s, stale after 90s)");
    }

    {
        let monitor_state = state.clone();
        tokio::spawn(async move {
            const CHECK_INTERVAL_SECS: u64 = 5;
            const MAX_DISCONNECT_SECS: u64 = 60;
            let mut disconnected_since: Option<std::time::Instant> = None;

            loop {
                tokio::time::sleep(std::time::Duration::from_secs(CHECK_INTERVAL_SECS)).await;
                let connected = monitor_state.db_connected.load(Ordering::SeqCst);

                if connected {
                    if disconnected_since.is_some() {
                        info!("SpacetimeDB connection restored");
                        disconnected_since = None;
                    }
                    continue;
                }

                let since = *disconnected_since.get_or_insert_with(std::time::Instant::now);
                let elapsed = since.elapsed().as_secs();

                if elapsed > 0 && elapsed.is_multiple_of(15) {
                    tracing::warn!(
                        "SpacetimeDB disconnected for {}s (will exit at {}s)",
                        elapsed,
                        MAX_DISCONNECT_SECS,
                    );
                }

                if elapsed >= MAX_DISCONNECT_SECS {
                    tracing::error!(
                        "SpacetimeDB disconnected for {}s, exiting for restart",
                        elapsed,
                    );
                    std::process::exit(1);
                }
            }
        });
        info!("DB connection monitor started (exit after 60s disconnect)");
    }

    let shutdown_state = state.clone();
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    info!("Server listening on 0.0.0.0:3000");
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let ctrl_c = tokio::signal::ctrl_c();
            let mut sigterm = tokio::signal::unix::signal(
                tokio::signal::unix::SignalKind::terminate(),
            ).expect("Failed to install SIGTERM handler");
            tokio::select! {
                _ = ctrl_c => {},
                _ = sigterm.recv() => {},
            }
            info!("Received shutdown signal, draining active sessions...");

            {
                let tokens = shutdown_state.cancel_tokens.lock().unwrap();
                let count = tokens.len();
                for (sid, token) in tokens.iter() {
                    token.store(true, Ordering::SeqCst);
                    info!("Cancelled session {sid} for shutdown");
                }
                if count > 0 {
                    info!("Cancelled {count} active session(s)");
                }
            }

            {
                shutdown_state.active_sessions.lock().unwrap().clear();
            }

            let drain_deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
            loop {
                let remaining = shutdown_state.cancel_tokens.lock().unwrap().len();
                if remaining == 0 {
                    info!("All sessions drained");
                    break;
                }
                if std::time::Instant::now() >= drain_deadline {
                    info!("{remaining} session(s) still active after drain timeout, proceeding with shutdown");
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            }
        })
        .await?;

    info!("Server shut down");
    Ok(())
}

async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let connected = state.db_connected.load(Ordering::SeqCst);
    let uptime_secs = state.started_at.elapsed().as_secs();
    let active_sessions = state.active_sessions.lock().unwrap().len();

    let body = serde_json::json!({
        "status": if connected { "ok" } else { "degraded" },
        "db_connected": connected,
        "uptime_seconds": uptime_secs,
        "active_sessions": active_sessions,
    });

    if connected {
        (StatusCode::OK, Json(body))
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, Json(body))
    }
}

async fn stop_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<StopRequest>,
) -> impl IntoResponse {
    let session_id = payload.session_id;

    let cancelled = {
        let tokens = state.cancel_tokens.lock().unwrap();
        if let Some(token) = tokens.get(&session_id) {
            token.store(true, Ordering::SeqCst);
            true
        } else {
            false
        }
    };

    if cancelled {
        info!("Stop requested for session {session_id}");
    } else {
        info!("Stop requested for session {session_id} (no active loop, forcing cleanup)");
        force_session_cleanup(&state, &session_id);
    }

    (StatusCode::OK, Json(serde_json::json!({ "stopped": true })))
}

fn require_db_connected(state: &AppState) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    if !state.db_connected.load(Ordering::SeqCst) {
        Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({ "error": "Database connection unavailable. Please retry shortly." })),
        ))
    } else {
        Ok(())
    }
}

fn force_session_cleanup(state: &AppState, session_id: &str) {
    for msg in state.conn.db.message().iter() {
        if msg.session_id == session_id && msg.status == "streaming" {
            let _ = state.conn.reducers.complete_message(msg.id.clone());
        }
    }
    for cmd in state.conn.db.tool_command().iter() {
        if cmd.session_id == session_id
            && (cmd.status == "pending" || cmd.status == "executing" || cmd.status == "generating")
        {
            let _ = state
                .conn
                .reducers
                .update_tool_command_status(cmd.id, "error".to_string());
        }
    }
    if let Err(e) = state
        .conn
        .reducers
        .update_session_status(session_id.to_string(), "idle".to_string())
    {
        tracing::warn!("force_session_cleanup: failed to set session {session_id} to idle: {e}");
    }
}

async fn regenerate_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RegenerateRequest>,
) -> impl IntoResponse {
    if let Err(resp) = require_db_connected(&state) {
        return resp;
    }
    let session_id = payload.session_id;
    let assistant_msg_id = payload.message_id;

    let assistant_msg = match state.conn.db.message().id().find(&assistant_msg_id) {
        Some(m) => m,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "Message not found" })),
            );
        }
    };

    if assistant_msg.role != "assistant" {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Can only regenerate assistant messages" })),
        );
    }

    if assistant_msg.session_id != session_id {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Message does not belong to this session" })),
        );
    }

    let mut session_messages: Vec<_> = state
        .conn
        .db
        .message()
        .iter()
        .filter(|m| m.session_id == session_id && m.status == "complete")
        .collect();
    session_messages.sort_by_key(|m| m.created_at);

    let user_msg = session_messages
        .iter()
        .rev()
        .find(|m| m.role == "user" && m.created_at <= assistant_msg.created_at);

    let (user_content, _user_msg_id) = match user_msg {
        Some(m) => {
            let parts: Vec<_> = state
                .conn
                .db
                .message_part()
                .iter()
                .filter(|p| p.message_id == m.id)
                .collect();
            let mut sorted_parts = parts;
            sorted_parts.sort_by_key(|p| p.part_index);
            let content: String = sorted_parts.iter().map(|p| p.content.as_str()).collect();
            (content, m.id.clone())
        }
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "No preceding user message found" })),
            );
        }
    };

    if let Err(e) = state
        .conn
        .reducers
        .delete_message(assistant_msg_id.clone())
    {
        tracing::error!("Failed to delete assistant message: {e}");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Failed to delete message" })),
        );
    }

    let owner_token = state
        .conn
        .db
        .session()
        .id()
        .find(&session_id)
        .map(|s| s.owner_token.clone())
        .unwrap_or_default();

    let new_msg_id = uuid::Uuid::new_v4().to_string();
    if let Err(e) = state.conn.reducers.send_message(
        new_msg_id.clone(),
        session_id.clone(),
        "user".to_string(),
        "queued".to_string(),
    ) {
        tracing::error!("Failed to send regenerate message: {e}");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Failed to queue regeneration" })),
        );
    }

    if let Err(e) = state
        .conn
        .reducers
        .append_message_part(new_msg_id.clone(), 0u32, user_content.clone())
    {
        tracing::warn!("Failed to store regenerate content: {e}");
    }

    let queued_msg = QueuedMessage {
        id: new_msg_id.clone(),
        content: user_content,
        owner_token,
        model: None,
    };

    let mut active = state.active_sessions.lock().unwrap();
    if let Some(tx) = active.get(&session_id) {
        if let Err(e) = tx.try_send(queued_msg) {
            tracing::error!(session_id, "Failed to queue message: {e}");
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "error": "Message queue full, try again" })),
            );
        }
    } else {
        let (tx, rx) = tokio::sync::mpsc::channel::<QueuedMessage>(16);
        if let Err(e) = tx.try_send(queued_msg) {
            tracing::error!(session_id, "Failed to send initial message: {e}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to initialize session queue" })),
            );
        }
        active.insert(session_id.clone(), tx);
        drop(active);

        let state_clone = state.clone();
        let session_clone = session_id.clone();
        tokio::spawn(async move {
            agent_loop::run_session_queue(&state_clone, &session_clone, rx).await;
        });
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "message_id": new_msg_id,
            "session_id": session_id,
        })),
    )
}

async fn edit_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<EditRequest>,
) -> impl IntoResponse {
    if let Err(resp) = require_db_connected(&state) {
        return resp;
    }
    let session_id = payload.session_id;
    let message_id = payload.message_id;
    let new_content = payload.content;

    if new_content.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Content cannot be empty" })),
        );
    }

    let target_msg = match state.conn.db.message().id().find(&message_id) {
        Some(m) => m,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "Message not found" })),
            );
        }
    };

    if target_msg.role != "user" {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Can only edit user messages" })),
        );
    }

    if target_msg.session_id != session_id {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Message does not belong to this session" })),
        );
    }

    let messages_after: Vec<_> = state
        .conn
        .db
        .message()
        .iter()
        .filter(|m| m.session_id == session_id && m.created_at > target_msg.created_at)
        .collect();

    for msg in &messages_after {
        if let Err(e) = state.conn.reducers.delete_message(msg.id.clone()) {
            tracing::warn!("Failed to delete message {} during edit: {e}", msg.id);
        }
    }

    let owner_token = state
        .conn
        .db
        .session()
        .id()
        .find(&session_id)
        .map(|s| s.owner_token.clone())
        .unwrap_or_default();

    if let Err(e) = state
        .conn
        .reducers
        .update_message_content(message_id.clone(), new_content.clone())
    {
        tracing::error!("Failed to update message content: {e}");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Failed to update message" })),
        );
    }

    let new_msg_id = uuid::Uuid::new_v4().to_string();
    if let Err(e) = state.conn.reducers.send_message(
        new_msg_id.clone(),
        session_id.clone(),
        "user".to_string(),
        "queued".to_string(),
    ) {
        tracing::error!("Failed to send edit message: {e}");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Failed to queue message" })),
        );
    }

    if let Err(e) = state
        .conn
        .reducers
        .append_message_part(new_msg_id.clone(), 0u32, new_content.clone())
    {
        tracing::warn!("Failed to store edit content: {e}");
    }

    let queued_msg = QueuedMessage {
        id: new_msg_id.clone(),
        content: new_content,
        owner_token,
        model: None,
    };

    let mut active = state.active_sessions.lock().unwrap();
    if let Some(tx) = active.get(&session_id) {
        if let Err(e) = tx.try_send(queued_msg) {
            tracing::error!(session_id, "Failed to queue edit message: {e}");
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "error": "Message queue full, try again" })),
            );
        }
    } else {
        let (tx, rx) = tokio::sync::mpsc::channel::<QueuedMessage>(16);
        if let Err(e) = tx.try_send(queued_msg) {
            tracing::error!(session_id, "Failed to send initial message: {e}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to initialize session queue" })),
            );
        }
        active.insert(session_id.clone(), tx);
        drop(active);

        let state_clone = state.clone();
        let session_clone = session_id.clone();
        tokio::spawn(async move {
            agent_loop::run_session_queue(&state_clone, &session_clone, rx).await;
        });
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "message_id": new_msg_id,
            "session_id": session_id,
        })),
    )
}

async fn service_echo_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    payload: Result<Json<ChatRequest>, JsonRejection>,
) -> impl IntoResponse {
    let service_key = match &state.service_key {
        Some(k) => k,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "Service endpoints not enabled" })),
            );
        }
    };

    let provided_key = match headers
        .get("x-service-key")
        .and_then(|v| v.to_str().ok())
    {
        Some(k) => k.to_string(),
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "error": "Missing X-Service-Key header" })),
            );
        }
    };

    let a = provided_key.as_bytes();
    let b = service_key.as_bytes();
    let valid = a.len() == b.len() && a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0;
    if !valid {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Invalid service key" })),
        );
    }

    let Json(payload) = match payload {
        Ok(p) => p,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "Invalid request body" })),
            );
        }
    };

    if payload.message.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Message cannot be empty" })),
        );
    }

    let session_id = payload.session_id;
    let user_msg_id = payload
        .user_message_id
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let assistant_msg_id = uuid::Uuid::new_v4().to_string();
    let owner_token = payload.owner_token.clone();

    if let Err(e) = state.conn.reducers.create_session(session_id.clone(), owner_token.clone()) {
        tracing::warn!("Session create (may already exist): {e}");
    }

    if let Err(e) = state.conn.reducers.send_message(
        user_msg_id.clone(),
        session_id.clone(),
        "user".to_string(),
        "complete".to_string(),
    ) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Failed to store user message: {e}") })),
        );
    }

    if let Err(e) = state.conn.reducers.append_message_part(
        user_msg_id.clone(),
        0,
        payload.message.clone(),
    ) {
        tracing::warn!("Failed to append user message part: {e}");
    }

    let echo_content = format!("[echo] {}", payload.message);

    if let Err(e) = state.conn.reducers.send_message(
        assistant_msg_id.clone(),
        session_id.clone(),
        "assistant".to_string(),
        "complete".to_string(),
    ) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Failed to store echo response: {e}") })),
        );
    }

    if let Err(e) = state.conn.reducers.append_message_part(
        assistant_msg_id.clone(),
        0,
        echo_content,
    ) {
        tracing::warn!("Failed to append echo message part: {e}");
    }

    info!("Service echo: session={session_id} user_msg={user_msg_id} echo_msg={assistant_msg_id}");

    (
        StatusCode::OK,
        Json(serde_json::json!(ChatResponse {
            message_id: assistant_msg_id,
            session_id,
        })),
    )
}

async fn chat_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    payload: Result<Json<ChatRequest>, JsonRejection>,
) -> impl IntoResponse {
    if let Err(resp) = require_db_connected(&state) {
        return resp;
    }
    let Json(payload) = match payload {
        Ok(p) => p,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "Invalid request body",
                })),
            );
        }
    };
    if let Some(token) = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
    {
        let a = token.as_bytes();
        let b = state.api_key.as_bytes();
        let valid = a.len() == b.len() && a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0;
        if !valid {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({
                    "error": "Invalid API key",
                })),
            );
        }
    }

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let old_start = state.global_window_start.load(Ordering::SeqCst);
    if now_secs.saturating_sub(old_start) >= 60 {
        if state.global_window_start.compare_exchange(
            old_start, now_secs, Ordering::SeqCst, Ordering::SeqCst
        ).is_ok() {
            state.global_request_count.store(1, Ordering::SeqCst);
        } else {
            state.global_request_count.fetch_add(1, Ordering::SeqCst);
        }
    } else {
        state.global_request_count.fetch_add(1, Ordering::SeqCst);
    }
    let count = state.global_request_count.load(Ordering::SeqCst);
    if count > 60 {
        let remaining = 60u64.saturating_sub(now_secs.saturating_sub(
            state.global_window_start.load(Ordering::SeqCst)
        ));
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({
                "error": format!("Rate limit exceeded. Retry after {remaining} seconds."),
            })),
        );
    }

    if payload.message.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "Message cannot be empty",
            })),
        );
    }

    if payload.session_id.is_empty() || payload.session_id.len() > 100 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "session_id must be 1-100 characters",
            })),
        );
    }

    if !payload.session_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "session_id must contain only alphanumeric characters, dashes, and underscores",
            })),
        );
    }

    let session_id = payload.session_id;

    {
        let active = state.active_sessions.lock().unwrap();
        if let Some(tx) = active.get(&session_id) {
            if tx.max_capacity() - tx.capacity() >= 5 {
                return (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(serde_json::json!({
                        "error": "Too many pending messages for this session. Wait for existing messages to process.",
                    })),
                );
            }
        }
    }

    let user_msg_id = payload
        .user_message_id
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    if state.conn.db.message().id().find(&user_msg_id).is_some() {
        return (
            StatusCode::OK,
            Json(serde_json::json!(ChatResponse {
                message_id: user_msg_id,
                session_id,
            })),
        );
    }

    if let Err(e) = state.conn.reducers.create_session(session_id.clone(), payload.owner_token.clone()) {
        tracing::warn!("Session create (may already exist): {e}");
    }

    if let Err(e) = state.conn.reducers.send_message(
        user_msg_id.clone(),
        session_id.clone(),
        "user".to_string(),
        "queued".to_string(),
    ) {
        tracing::error!("send_message reducer failed: {e}");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "error": "Failed to send message. Please try again.",
            })),
        );
    }

    if let Err(e) = state.conn.reducers.append_message_part(
        user_msg_id.clone(),
        0u32,
        payload.message.clone(),
    ) {
        tracing::warn!("Failed to store user message content: {e}");
    }

    let is_first_message = {
        let messages: Vec<_> = state
            .conn
            .db
            .message()
            .iter()
            .filter(|m| m.session_id == session_id)
            .collect();
        messages.len() <= 1
    };

    if is_first_message {
        let title = if payload.message.chars().count() > 80 {
            format!("{}...", payload.message.chars().take(77).collect::<String>())
        } else {
            payload.message.clone()
        };
        let _ = state
            .conn
            .reducers
            .update_session_title(session_id.clone(), title);

        if let Some(ref model) = payload.model {
            let _ = state
                .conn
                .reducers
                .update_session_model(session_id.clone(), Some(model.clone()));
        }
    }

    let queued_msg = QueuedMessage {
        id: user_msg_id.clone(),
        content: payload.message.clone(),
        owner_token: payload.owner_token.clone(),
        model: payload.model.clone(),
    };

    let mut active = state.active_sessions.lock().unwrap();
    if let Some(tx) = active.get(&session_id) {
        if let Err(e) = tx.try_send(queued_msg) {
            tracing::error!(session_id, "Failed to queue message: {e}");
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "error": "Message queue full, try again" })),
            );
        }
    } else {
        let (tx, rx) = tokio::sync::mpsc::channel::<QueuedMessage>(16);
        if let Err(e) = tx.try_send(queued_msg) {
            tracing::error!(session_id, "Failed to send initial message: {e}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to initialize session queue" })),
            );
        }
        active.insert(session_id.clone(), tx);
        drop(active);

        let state_clone = state.clone();
        let session_clone = session_id.clone();

        tokio::spawn(async move {
            agent_loop::run_session_queue(&state_clone, &session_clone, rx).await;
        });
    }

    (
        StatusCode::OK,
        Json(serde_json::json!(ChatResponse {
            message_id: user_msg_id,
            session_id,
        })),
    )
}
