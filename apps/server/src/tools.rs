use anyhow::Result;
use spacetimedb_sdk::Table;
use std::time::Instant;

use crate::module_bindings;
use crate::module_bindings::create_tool_command_reducer::create_tool_command;
use crate::module_bindings::tool_command_table::ToolCommandTableAccess;
use crate::module_bindings::tool_result_table::ToolResultTableAccess;
use crate::state::{AppState, ToolCall, ToolDefinition, FunctionDefinition};

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "file_read".to_string(),
                description: "Read a file (returns numbered lines like '1: content'). Directories return a listing. Default 2000 lines. Output truncated at 30000 chars."
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
                description: "Write content to a file. Creates parent directories. Overwrites existing content.".to_string(),
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
                description: "Replace an exact string in a file. Fails if old string not found. If multiple matches exist, fails unless replace_all is true.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file" },
                        "old": { "type": "string", "description": "Exact string to find" },
                        "new": { "type": "string", "description": "Replacement string" },
                        "replace_all": { "type": "boolean", "description": "Replace all occurrences (default false)" }
                    },
                    "required": ["path", "old", "new"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "shell_exec".to_string(),
                description: "Execute a shell command. Returns stdout (and stderr for successful commands). On failure returns exit code and stderr. 120s timeout. Output truncated at 1MB, then 30000 chars. Default workdir is home.".to_string(),
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
                description: "Find files matching a glob pattern recursively. Max 1000 results. Output truncated at 30000 chars.".to_string(),
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
                description: "Search file contents with regex. Returns 'path:line:content' format. Max 500 matches. Skips .git, node_modules, target. Output truncated at 30000 chars.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string", "description": "Regex pattern to search for" },
                        "path": { "type": "string", "description": "Directory or file path to search in. Optional, defaults to home directory." },
                        "include": { "type": "string", "description": "File extension filter (e.g. *.rs, *.ts). Optional." }
                    },
                    "required": ["pattern"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "list_dir".to_string(),
                description: "List directory contents showing file sizes, types, and permissions. Output truncated at 30000 chars.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the directory" }
                    },
                    "required": ["path"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "web_fetch".to_string(),
                description: "Fetch a URL and return its content as clean text. HTML tags, scripts, and styles are stripped. Returns up to 30000 characters.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "The URL to fetch (must start with http:// or https://)" }
                    },
                    "required": ["url"]
                }),
            },
        },
    ]
}

pub async fn dispatch_tool_call(
    state: &AppState,
    session_id: &str,
    message_id: &str,
    agent_id: &str,
    tool_call: &ToolCall,
) -> Result<String> {
    let dispatch_start = Instant::now();
    let (cmd_tx, cmd_rx) = tokio::sync::oneshot::channel::<u64>();
    let cmd_tx = std::sync::Mutex::new(Some(cmd_tx));
    let match_message_id = message_id.to_string();
    let match_tool_name = tool_call.function.name.clone();

    let insert_cb = state.conn.db.tool_command().on_insert(move |_ctx, row| {
        if row.message_id == match_message_id && row.tool_name == match_tool_name {
            if let Some(tx) = cmd_tx.lock().unwrap().take() {
                let _ = tx.send(row.id);
            }
        }
    });

    if let Err(e) = state.conn.reducers.create_tool_command(
        tool_call.id.clone(),
        message_id.to_string(),
        session_id.to_string(),
        agent_id.to_string(),
        tool_call.function.name.clone(),
        tool_call.function.arguments.clone(),
    ) {
        state.conn.db.tool_command().remove_on_insert(insert_cb);
        return Err(anyhow::anyhow!("Failed to create tool command: {e}"));
    }

    let cmd_id = match tokio::time::timeout(std::time::Duration::from_secs(10), cmd_rx).await {
        Ok(Ok(id)) => {
            state.conn.db.tool_command().remove_on_insert(insert_cb);
            id
        }
        _ => {
            state.conn.db.tool_command().remove_on_insert(insert_cb);
            return Ok("Tool command was not created (agent may be offline)".to_string());
        }
    };
    let cmd_create_ms = dispatch_start.elapsed().as_millis() as u64;

    let (result_tx, result_rx) = tokio::sync::oneshot::channel::<ToolResult>();
    let result_tx = std::sync::Mutex::new(Some(result_tx));
    let watch_cmd_id = cmd_id;

    let result_cb = state.conn.db.tool_result().on_insert(move |_ctx, row| {
        if row.tool_command_id == watch_cmd_id {
            if let Some(tx) = result_tx.lock().unwrap().take() {
                let _ = tx.send((row.success, row.output.clone(), row.error.clone()));
            }
        }
    });

    if let Some(result) = check_result_cache(&state.conn.db, cmd_id) {
        state.conn.db.tool_result().remove_on_insert(result_cb);
        let exec_ms = dispatch_start.elapsed().as_millis() as u64 - cmd_create_ms;
        let total_ms = dispatch_start.elapsed().as_millis() as u64;
        tracing::info!(
            session_id,
            tool = tool_call.function.name,
            cmd_create_ms,
            exec_ms,
            total_ms,
            success = result.0,
            output_len = result.1.len(),
            source = "cache_hit",
            "Tool dispatch complete"
        );
        return format_tool_result(result);
    }

    let exec_start = Instant::now();
    let result = wait_for_result(result_rx, &state.conn.db, cmd_id).await;
    state.conn.db.tool_result().remove_on_insert(result_cb);

    match result {
        Some(r) => {
            let exec_ms = exec_start.elapsed().as_millis() as u64;
            let total_ms = dispatch_start.elapsed().as_millis() as u64;
            tracing::info!(
                session_id,
                tool = tool_call.function.name,
                cmd_create_ms,
                exec_ms,
                total_ms,
                success = r.0,
                output_len = r.1.len(),
                "Tool dispatch complete"
            );
            format_tool_result(r)
        }
        None => {
            tracing::warn!(
                session_id,
                tool = tool_call.function.name,
                cmd_create_ms,
                total_ms = dispatch_start.elapsed().as_millis() as u64,
                "Tool execution timed out"
            );
            Ok("Tool execution timed out after 120 seconds".to_string())
        }
    }
}

type ToolResult = (bool, String, Option<String>);

async fn wait_for_result(
    mut callback_rx: tokio::sync::oneshot::Receiver<ToolResult>,
    db: &module_bindings::RemoteTables,
    cmd_id: u64,
) -> Option<ToolResult> {
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(120);
    let mut poll_interval = tokio::time::interval(std::time::Duration::from_millis(500));
    poll_interval.tick().await;

    loop {
        tokio::select! {
            res = &mut callback_rx => {
                return res.ok();
            }
            _ = poll_interval.tick() => {
                if let Some(result) = check_result_cache(db, cmd_id) {
                    return Some(result);
                }
            }
            _ = tokio::time::sleep_until(deadline) => {
                return check_result_cache(db, cmd_id);
            }
        }
    }
}

fn check_result_cache(
    db: &module_bindings::RemoteTables,
    cmd_id: u64,
) -> Option<ToolResult> {
    for row in db.tool_result().iter() {
        if row.tool_command_id == cmd_id {
            return Some((row.success, row.output.clone(), row.error.clone()));
        }
    }
    None
}

fn format_tool_result(result: ToolResult) -> Result<String> {
    let (success, output, error) = result;
    if success {
        let output = if output.len() > 30000 {
            format!("{}... (truncated)", &output[..30000])
        } else {
            output
        };
        Ok(output)
    } else {
        Ok(format!("Tool error: {}", error.unwrap_or(output)))
    }
}
