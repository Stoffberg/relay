mod module_bindings;

use anyhow::Result;
use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::post, Json, Router};
use futures::StreamExt;
use module_bindings::agent_table::AgentTableAccess;
use module_bindings::message_part_table::MessagePartTableAccess;
use module_bindings::message_table::MessageTableAccess;
use module_bindings::session_table::SessionTableAccess;
use module_bindings::tool_command_table::ToolCommandTableAccess;
use module_bindings::tool_result_table::ToolResultTableAccess;
use module_bindings::{
    append_message_part, complete_message, create_session, create_tool_command, fail_message,
    send_message, update_session_status, update_session_title, DbConnection,
};
use serde::{Deserialize, Serialize};
use spacetimedb_sdk::{DbContext, Table};
use std::sync::Arc;
use tokio::sync::oneshot;
use tower_http::cors::CorsLayer;
use tracing::info;

pub struct AppState {
    openrouter_key: String,
    openrouter_model: String,
    http: reqwest::Client,
    conn: DbConnection,
}

#[derive(Deserialize)]
pub struct ChatRequest {
    pub message: String,
    pub session_id: String,
    pub user_message_id: Option<String>,
}

#[derive(Serialize)]
pub struct ChatResponse {
    pub message_id: String,
    pub session_id: String,
}

#[derive(Serialize, Clone)]
struct LLMRequest {
    model: String,
    messages: Vec<LLMMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<ToolDefinition>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct LLMMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String,
    function: ToolCallFunction,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ToolCallFunction {
    name: String,
    arguments: String,
}

#[derive(Serialize, Clone, Debug)]
struct ToolDefinition {
    #[serde(rename = "type")]
    tool_type: String,
    function: FunctionDefinition,
}

#[derive(Serialize, Clone, Debug)]
struct FunctionDefinition {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Deserialize)]
struct SSEChunk {
    choices: Vec<SSEChoice>,
}

#[derive(Deserialize)]
struct SSEChoice {
    delta: Option<SSEDelta>,
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
struct SSEDelta {
    content: Option<String>,
    tool_calls: Option<Vec<SSEToolCall>>,
}

#[derive(Deserialize, Clone, Debug)]
struct SSEToolCall {
    index: Option<usize>,
    id: Option<String>,
    function: Option<SSEToolCallFunction>,
}

#[derive(Deserialize, Clone, Debug)]
struct SSEToolCallFunction {
    name: Option<String>,
    arguments: Option<String>,
}

fn tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "file_read".to_string(),
                description: "Read a file from the filesystem. Returns contents with line numbers. If the path is a directory, lists its entries instead."
                    .to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file or directory" },
                        "offset": { "type": "integer", "description": "Line number to start from (1-indexed). Optional." },
                        "limit": { "type": "integer", "description": "Maximum number of lines to read. Optional, defaults to 2000." }
                    },
                    "required": ["path"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "file_write".to_string(),
                description: "Write content to a file, creating parent directories and overwriting if it exists.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file" },
                        "content": { "type": "string", "description": "Content to write" }
                    },
                    "required": ["path", "content"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "file_edit".to_string(),
                description: "Replace an exact string in a file with another string. Fails if the old string is not found.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file" },
                        "old": { "type": "string", "description": "Exact string to find" },
                        "new": { "type": "string", "description": "Replacement string" }
                    },
                    "required": ["path", "old", "new"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "shell_exec".to_string(),
                description: "Execute a shell command and return its output.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "Shell command to execute" },
                        "workdir": { "type": "string", "description": "Working directory to run the command in. Optional." }
                    },
                    "required": ["command"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "glob".to_string(),
                description: "Find files matching a glob pattern. Searches recursively.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string", "description": "Glob pattern to match (e.g. **/*.rs)" },
                        "path": { "type": "string", "description": "Base directory to search in. Optional, defaults to home directory." }
                    },
                    "required": ["pattern"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "grep".to_string(),
                description: "Search file contents recursively using a regex pattern. Skips .git, node_modules, and target directories.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string", "description": "Regex pattern to search for" },
                        "path": { "type": "string", "description": "Directory or file path to search in" },
                        "include": { "type": "string", "description": "File extension filter (e.g. *.rs, *.ts). Optional." }
                    },
                    "required": ["pattern", "path"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "list_dir".to_string(),
                description: "List directory contents with file sizes and types.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the directory" }
                    },
                    "required": ["path"]
                }),
            },
        },
    ]
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let spacetime_host = std::env::var("SPACETIME_HOST")
        .unwrap_or_else(|_| "https://maincloud.spacetimedb.com".to_string());
    let spacetime_db = std::env::var("SPACETIME_DB").unwrap_or_else(|_| "relay".to_string());

    info!("Connecting to SpacetimeDB at {spacetime_host}, database: {spacetime_db}");

    let (ready_tx, ready_rx) = oneshot::channel::<()>();
    let ready_tx = std::sync::Mutex::new(Some(ready_tx));

    let conn = DbConnection::builder()
        .with_uri(&spacetime_host)
        .with_database_name(&spacetime_db)
        .on_connect(move |_conn, identity, _token| {
            info!("Connected to SpacetimeDB as {identity}");
        })
        .on_disconnect(|_ctx, err| {
            tracing::error!("Disconnected from SpacetimeDB: {err:?}");
        })
        .build()
        .expect("Failed to connect to SpacetimeDB");

    conn.subscription_builder()
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

    conn.run_threaded();

    info!("Waiting for subscription to be applied...");
    ready_rx.await.expect("Subscription readiness signal failed");
    info!("SpacetimeDB client cache ready");

    let state = Arc::new(AppState {
        openrouter_key: std::env::var("OPENROUTER_API_KEY").expect("OPENROUTER_API_KEY required"),
        openrouter_model: std::env::var("OPENROUTER_MODEL")
            .unwrap_or_else(|_| "anthropic/claude-3.5-sonnet".to_string()),
        http: reqwest::Client::new(),
        conn,
    });

    let app = Router::new()
        .route("/health", axum::routing::get(health))
        .route("/chat", post(chat_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    info!("Server listening on 0.0.0.0:3000");
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok" }))
}

async fn chat_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ChatRequest>,
) -> impl IntoResponse {
    let session_id = payload.session_id;
    let user_msg_id = payload
        .user_message_id
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    if let Err(e) = state.conn.reducers.create_session(session_id.clone()) {
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
            Json(serde_json::json!({
                "error": format!("Failed to create user message: {e}"),
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
        let title = if payload.message.len() > 80 {
            format!("{}...", &payload.message[..77])
        } else {
            payload.message.clone()
        };
        let _ = state
            .conn
            .reducers
            .update_session_title(session_id.clone(), title);
    }

    let _ = state
        .conn
        .reducers
        .update_session_status(session_id.clone(), "streaming".to_string());

    let state_clone = state.clone();
    let session_clone = session_id.clone();
    let user_message = payload.message.clone();

    tokio::spawn(async move {
        if let Err(e) = run_agent_loop(&state_clone, &session_clone, &user_message).await {
            tracing::error!("Agent loop failed: {e}");
        }
        let _ = state_clone
            .conn
            .reducers
            .update_session_status(session_clone, "idle".to_string());
    });

    (
        StatusCode::OK,
        Json(serde_json::json!(ChatResponse {
            message_id: user_msg_id,
            session_id,
        })),
    )
}

fn fetch_history(conn: &DbConnection, session_id: &str) -> Vec<LLMMessage> {
    let mut messages: Vec<_> = conn
        .db
        .message()
        .iter()
        .filter(|m| m.session_id == session_id && m.status == "complete")
        .collect();

    messages.sort_by_key(|m| m.created_at);

    let message_ids: std::collections::HashSet<&str> =
        messages.iter().map(|m| m.id.as_str()).collect();

    let parts: Vec<_> = conn
        .db
        .message_part()
        .iter()
        .filter(|p| message_ids.contains(p.message_id.as_str()))
        .collect();

    let mut content_by_msg: std::collections::HashMap<&str, Vec<_>> =
        std::collections::HashMap::new();
    for part in &parts {
        content_by_msg
            .entry(part.message_id.as_str())
            .or_default()
            .push(part);
    }

    for parts_vec in content_by_msg.values_mut() {
        parts_vec.sort_by_key(|p| p.part_index);
    }

    let tool_commands: Vec<_> = conn
        .db
        .tool_command()
        .iter()
        .filter(|c| c.session_id == session_id)
        .collect();

    let tool_results: Vec<_> = conn.db.tool_result().iter().collect();

    let mut result = Vec::new();

    for m in &messages {
        let text = content_by_msg
            .get(m.id.as_str())
            .map(|parts| {
                parts
                    .iter()
                    .map(|p| p.content.as_str())
                    .collect::<String>()
            })
            .unwrap_or_default();

        if m.role == "assistant" {
            let msg_tool_calls: Vec<_> = tool_commands
                .iter()
                .filter(|c| c.message_id == m.id)
                .collect();

            if msg_tool_calls.is_empty() {
                if !text.is_empty() {
                    result.push(LLMMessage {
                        role: "assistant".to_string(),
                        content: Some(text),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
            } else {
                let tc: Vec<ToolCall> = msg_tool_calls
                    .iter()
                    .enumerate()
                    .map(|(_i, c)| ToolCall {
                        id: format!("call_{}", c.id),
                        call_type: "function".to_string(),
                        function: ToolCallFunction {
                            name: c.tool_name.clone(),
                            arguments: c.tool_args.clone(),
                        },
                    })
                    .collect();

                result.push(LLMMessage {
                    role: "assistant".to_string(),
                    content: if text.is_empty() { None } else { Some(text) },
                    tool_calls: Some(tc.clone()),
                    tool_call_id: None,
                });

                for (i, cmd) in msg_tool_calls.iter().enumerate() {
                    let tool_output = tool_results
                        .iter()
                        .find(|r| r.tool_command_id == cmd.id)
                        .map(|r| {
                            if r.success {
                                if r.output.len() > 2000 {
                                    format!("{}... (truncated)", &r.output[..2000])
                                } else {
                                    r.output.clone()
                                }
                            } else {
                                format!(
                                    "Error: {}",
                                    r.error.clone().unwrap_or_else(|| r.output.clone())
                                )
                            }
                        })
                        .unwrap_or_else(|| "Tool did not return a result".to_string());

                    result.push(LLMMessage {
                        role: "tool".to_string(),
                        content: Some(tool_output),
                        tool_calls: None,
                        tool_call_id: Some(tc[i].id.clone()),
                    });
                }
            }
        } else if !text.is_empty() {
            result.push(LLMMessage {
                role: m.role.clone(),
                content: Some(text),
                tool_calls: None,
                tool_call_id: None,
            });
        }
    }

    result
}

fn has_online_agent(conn: &DbConnection) -> bool {
    conn.db.agent().iter().any(|a| a.status == "online")
}

fn find_agent_id(conn: &DbConnection) -> Option<String> {
    conn.db
        .agent()
        .iter()
        .find(|a| a.status == "online")
        .map(|a| a.id.clone())
}

async fn run_agent_loop(
    state: &AppState,
    session_id: &str,
    initial_message: &str,
) -> Result<()> {
    let history = fetch_history(&state.conn, session_id);
    let use_tools = has_online_agent(&state.conn);

    let mut conversation = vec![LLMMessage {
        role: "system".to_string(),
        content: Some(
            r#"You are Relay, an AI coding agent running on the user's local machine. You have direct access to their filesystem and shell via tools.

Core behavior:
- Be proactive. If you need information, use your tools to get it. Never ask the user for file paths, system info, or directory listings when you can discover them yourself.
- Start by orienting yourself: use shell_exec to run commands like `echo ~`, `whoami`, `uname`, `pwd`, or `ls` to understand the environment.
- When the user says "my downloads folder" or "this project", figure out what they mean using your tools. Don't ask them to provide paths.
- Use tools aggressively. Read files, list directories, search codebases, run commands. Act first, explain after.
- Keep explanations concise. Show results, not process narration.
- When making changes to code, read the existing code first to match patterns and style.
- If a tool call fails, try a different approach before asking the user for help.
- You can chain multiple tool calls in sequence. Don't stop after one tool call if the task isn't done."#.to_string(),
        ),
        tool_calls: None,
        tool_call_id: None,
    }];
    conversation.extend(history);
    conversation.push(LLMMessage {
        role: "user".to_string(),
        content: Some(initial_message.to_string()),
        tool_calls: None,
        tool_call_id: None,
    });

    let max_iterations = 20;
    for iteration in 0..max_iterations {
        let assistant_msg_id = uuid::Uuid::new_v4().to_string();

        if let Err(e) = state.conn.reducers.send_message(
            assistant_msg_id.clone(),
            session_id.to_string(),
            "assistant".to_string(),
            "streaming".to_string(),
        ) {
            tracing::error!("Failed to create assistant message: {e}");
            return Err(anyhow::anyhow!("Failed to create assistant message"));
        }

        let tools = if use_tools {
            Some(tool_definitions())
        } else {
            None
        };

        let result = stream_llm_response(state, &conversation, &assistant_msg_id, tools).await?;

        match result {
            LLMResult::TextComplete(text) => {
                state
                    .conn
                    .reducers
                    .complete_message(assistant_msg_id.clone())
                    .map_err(|e| anyhow::anyhow!("Failed to complete message: {e}"))?;

                conversation.push(LLMMessage {
                    role: "assistant".to_string(),
                    content: Some(text),
                    tool_calls: None,
                    tool_call_id: None,
                });
                break;
            }
            LLMResult::ToolCalls(text, tool_calls) => {
                state
                    .conn
                    .reducers
                    .complete_message(assistant_msg_id.clone())
                    .map_err(|e| anyhow::anyhow!("Failed to complete message: {e}"))?;

                conversation.push(LLMMessage {
                    role: "assistant".to_string(),
                    content: if text.is_empty() { None } else { Some(text) },
                    tool_calls: Some(tool_calls.clone()),
                    tool_call_id: None,
                });

                let _ = state.conn.reducers.update_session_status(
                    session_id.to_string(),
                    "waiting_for_tool".to_string(),
                );

                let agent_id = find_agent_id(&state.conn).unwrap_or_default();

                for tool_call in &tool_calls {
                    let tool_result = dispatch_tool_call(
                        state,
                        session_id,
                        &assistant_msg_id,
                        &agent_id,
                        tool_call,
                    )
                    .await?;

                    conversation.push(LLMMessage {
                        role: "tool".to_string(),
                        content: Some(tool_result),
                        tool_calls: None,
                        tool_call_id: Some(tool_call.id.clone()),
                    });
                }

                let _ = state.conn.reducers.update_session_status(
                    session_id.to_string(),
                    "streaming".to_string(),
                );
            }
            LLMResult::Error(e) => {
                let _ = state
                    .conn
                    .reducers
                    .fail_message(assistant_msg_id, e.clone());
                return Err(anyhow::anyhow!("{e}"));
            }
        }

        if iteration == max_iterations - 1 {
            tracing::warn!("Hit max iterations for session {session_id}");
        }
    }

    Ok(())
}

enum LLMResult {
    TextComplete(String),
    ToolCalls(String, Vec<ToolCall>),
    Error(String),
}

async fn stream_llm_response(
    state: &AppState,
    messages: &[LLMMessage],
    assistant_msg_id: &str,
    tools: Option<Vec<ToolDefinition>>,
) -> Result<LLMResult> {
    let body = LLMRequest {
        model: state.openrouter_model.clone(),
        stream: true,
        messages: messages.to_vec(),
        tools,
    };

    let res = state
        .http
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", state.openrouter_key))
        .json(&body)
        .send()
        .await?;

    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        return Ok(LLMResult::Error(format!(
            "OpenRouter returned {status}: {text}"
        )));
    }

    let mut stream = res.bytes_stream();
    let mut part_index: u32 = 0;
    let mut line_buffer = String::new();
    let mut full_text = String::new();
    let mut tool_calls: Vec<ToolCall> = Vec::new();
    let mut finish_reason: Option<String> = None;
    let stream_timeout = std::time::Duration::from_secs(15);

    loop {
        let maybe_chunk = tokio::time::timeout(stream_timeout, stream.next()).await;

        let chunk = match maybe_chunk {
            Err(_) => {
                tracing::warn!("Stream timed out (no data for 15s)");
                break;
            }
            Ok(None) => break,
            Ok(Some(c)) => c?,
        };

        let text = String::from_utf8_lossy(&chunk);
        line_buffer.push_str(&text);

        while let Some(newline_pos) = line_buffer.find('\n') {
            let line = line_buffer[..newline_pos].trim().to_string();
            line_buffer = line_buffer[newline_pos + 1..].to_string();

            if line.is_empty() || !line.starts_with("data: ") {
                continue;
            }

            let data = &line[6..];
            if data == "[DONE]" {
                continue;
            }

            if let Ok(chunk) = serde_json::from_str::<SSEChunk>(data) {
                if let Some(choice) = chunk.choices.first() {
                    if let Some(reason) = &choice.finish_reason {
                        finish_reason = Some(reason.clone());
                    }

                    if let Some(delta) = &choice.delta {
                        if let Some(content) = &delta.content {
                            if !content.is_empty() {
                                full_text.push_str(content);
                                if let Err(e) = state.conn.reducers.append_message_part(
                                    assistant_msg_id.to_string(),
                                    part_index,
                                    content.clone(),
                                ) {
                                    tracing::warn!("Failed to append part {part_index}: {e}");
                                }
                                part_index += 1;
                            }
                        }

                        if let Some(tc_deltas) = &delta.tool_calls {
                            for tc_delta in tc_deltas {
                                let idx = tc_delta.index.unwrap_or(0);
                                while tool_calls.len() <= idx {
                                    tool_calls.push(ToolCall {
                                        id: String::new(),
                                        call_type: "function".to_string(),
                                        function: ToolCallFunction {
                                            name: String::new(),
                                            arguments: String::new(),
                                        },
                                    });
                                }
                                if let Some(id) = &tc_delta.id {
                                    tool_calls[idx].id = id.clone();
                                }
                                if let Some(func) = &tc_delta.function {
                                    if let Some(name) = &func.name {
                                        tool_calls[idx].function.name.push_str(name);
                                    }
                                    if let Some(args) = &func.arguments {
                                        tool_calls[idx].function.arguments.push_str(args);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if !tool_calls.is_empty()
        && finish_reason.as_deref() == Some("tool_calls")
    {
        Ok(LLMResult::ToolCalls(full_text, tool_calls))
    } else {
        Ok(LLMResult::TextComplete(full_text))
    }
}

async fn dispatch_tool_call(
    state: &AppState,
    session_id: &str,
    message_id: &str,
    agent_id: &str,
    tool_call: &ToolCall,
) -> Result<String> {
    let pre_max_id = state
        .conn
        .db
        .tool_command()
        .iter()
        .map(|c| c.id)
        .max()
        .unwrap_or(0);

    if let Err(e) = state.conn.reducers.create_tool_command(
        message_id.to_string(),
        session_id.to_string(),
        agent_id.to_string(),
        tool_call.function.name.clone(),
        tool_call.function.arguments.clone(),
    ) {
        return Err(anyhow::anyhow!("Failed to create tool command: {e}"));
    }

    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    let cmd_id = state
        .conn
        .db
        .tool_command()
        .iter()
        .filter(|c| {
            c.id > pre_max_id
                && c.message_id == message_id
                && c.tool_name == tool_call.function.name
        })
        .map(|c| c.id)
        .max();

    let cmd_id = match cmd_id {
        Some(id) => id,
        None => {
            return Ok("Tool command was not created (agent may be offline)".to_string());
        }
    };

    let timeout = std::time::Duration::from_secs(120);
    let start = std::time::Instant::now();

    loop {
        if start.elapsed() > timeout {
            return Ok("Tool execution timed out after 120 seconds".to_string());
        }

        let maybe_cmd = state
            .conn
            .db
            .tool_command()
            .iter()
            .find(|c| c.id == cmd_id && (c.status == "completed" || c.status == "error"));

        if maybe_cmd.is_some() {
            let result = state
                .conn
                .db
                .tool_result()
                .iter()
                .find(|r| r.tool_command_id == cmd_id);

            if let Some(result) = result {
                if result.success {
                    let output = if result.output.len() > 10000 {
                        format!("{}... (truncated)", &result.output[..10000])
                    } else {
                        result.output.clone()
                    };
                    return Ok(output);
                } else {
                    return Ok(format!(
                        "Tool error: {}",
                        result.error.clone().unwrap_or_else(|| result.output.clone())
                    ));
                }
            }
        }

        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
}
