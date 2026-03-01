use anyhow::Result;
use spacetimedb_sdk::Table;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use crate::module_bindings;
use crate::module_bindings::create_tool_command_reducer::create_tool_command;
use crate::module_bindings::create_tool_result_reducer::create_tool_result;
use crate::module_bindings::tool_command_table::ToolCommandTableAccess;
use crate::module_bindings::tool_result_table::ToolResultTableAccess;
use crate::module_bindings::update_tool_command_args_reducer::update_tool_command_args;
use crate::module_bindings::update_tool_command_status_reducer::update_tool_command_status;
use crate::state::{AppState, ToolCall, ToolDefinition, FunctionDefinition};

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "file_read".to_string(),
                description: "Read a file (returns numbered lines like '1: content'). Directories return a listing. Default 2000 lines."
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
                description: "Create a new file or replace an entire file. For modifying existing files, always use file_edit instead. Set overwrite to true only if you need to completely replace an existing file.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file" },
                        "content": { "type": "string", "description": "Content to write" },
                        "overwrite": { "type": "boolean", "description": "Must be true to replace an existing file. Defaults to false." }
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
                description: "Find files matching a glob pattern recursively. Max 1000 results. ALWAYS provide a path. Pattern MUST include a file filter (e.g. **/*.rs, *.jpg, **/*.test.ts). Bare wildcards like * or **/* are rejected.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string", "description": "Glob pattern to match (e.g. **/*.rs)" },
                        "path": { "type": "string", "description": "Base directory to search in. REQUIRED for performance." }
                    },
                    "required": ["pattern", "path"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "grep".to_string(),
                description: "Search file contents with regex. Returns 'path:line:content' format. Max 500 matches. Skips .git, node_modules, target. ALWAYS provide a path.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string", "description": "Regex pattern to search for" },
                        "path": { "type": "string", "description": "Directory or file path to search in. REQUIRED for performance." },
                        "include": { "type": "string", "description": "File extension filter (e.g. *.rs, *.ts). Optional." }
                    },
                    "required": ["pattern", "path"]
                }),
            },
        },

        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "web_fetch".to_string(),
                description: "Fetch a URL and return its content as clean text. HTML tags, scripts, and styles are stripped.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "The URL to fetch (must start with http:// or https://)" }
                    },
                    "required": ["url"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "wait".to_string(),
                description: "Wait for a specified number of seconds. Use this instead of shell_exec with sleep. Runs server-side, does not require the agent. Maximum 300 seconds.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "seconds": { "type": "integer", "description": "Number of seconds to wait (1 to 300)" }
                    },
                    "required": ["seconds"]
                }),
            },
        },
    ]
}

pub const WAIT_TOOL_NAME: &str = "wait";

pub fn is_wait_tool_call(tc: &ToolCall) -> bool {
    tc.function.name == WAIT_TOOL_NAME
}

pub async fn execute_wait(
    state: &AppState,
    session_id: &str,
    message_id: &str,
    tc: &ToolCall,
    cancel_flag: &AtomicBool,
) -> Result<String> {
    let args: serde_json::Value = serde_json::from_str(&tc.function.arguments)
        .map_err(|e| anyhow::anyhow!("Invalid wait arguments: {e}"))?;
    let seconds = args["seconds"]
        .as_u64()
        .ok_or_else(|| anyhow::anyhow!("Missing or invalid 'seconds' parameter"))?;
    let seconds = seconds.min(300);

    if let Err(e) = state.conn.reducers.create_tool_command(
        tc.id.clone(),
        message_id.to_string(),
        session_id.to_string(),
        String::new(),
        WAIT_TOOL_NAME.to_string(),
        serde_json::json!({ "seconds": seconds, "remaining": seconds }).to_string(),
        "pending".to_string(),
    ) {
        tracing::warn!(session_id, "Failed to create wait tool command: {e}");
    }

    let cmd_id = wait_for_cmd_id(state, &tc.id).await;

    if let Some(id) = cmd_id {
        let _ = state.conn.reducers.update_tool_command_status(id, "executing".to_string());
    } else {
        tracing::warn!(session_id, "Wait tool command not found in cache after creation");
    }

    let mut remaining = seconds;
    while remaining > 0 {
        if cancel_flag.load(Ordering::SeqCst) {
            if let Some(id) = cmd_id {
                let _ = state.conn.reducers.create_tool_result(
                    id,
                    true,
                    format!("Wait cancelled after {}s ({}s remaining)", seconds - remaining, remaining),
                    None,
                );
                let _ = state.conn.reducers.update_tool_command_status(id, "completed".to_string());
            }
            return Ok(format!("Wait cancelled after {}s ({}s remaining)", seconds - remaining, remaining));
        }
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        remaining -= 1;
        if let Some(id) = cmd_id {
            let _ = state.conn.reducers.update_tool_command_args(
                id,
                serde_json::json!({ "seconds": seconds, "remaining": remaining }).to_string(),
            );
        }
    }

    if let Some(id) = cmd_id {
        let _ = state.conn.reducers.create_tool_result(
            id,
            true,
            format!("Waited {seconds} seconds"),
            None,
        );
        let _ = state.conn.reducers.update_tool_command_status(id, "completed".to_string());
    }
    Ok(format!("Waited {seconds} seconds"))
}

async fn wait_for_cmd_id(state: &AppState, tool_call_id: &str) -> Option<u64> {
    for _ in 0..20 {
        if let Some(id) = find_cmd_id_in_cache(&state.conn.db, tool_call_id) {
            return Some(id);
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    None
}

pub async fn dispatch_tool_call(
    state: &AppState,
    session_id: &str,
    message_id: &str,
    agent_id: &str,
    tool_call: &ToolCall,
    already_dispatched: bool,
    cancel_flag: &AtomicBool,
) -> Result<String> {
    let dispatch_start = Instant::now();
    let mut cmd_create_ms: u64 = 0;

    let cmd_id = if already_dispatched {
        find_cmd_id_in_cache(&state.conn.db, &tool_call.id)
    } else {
        None
    };

    let cmd_id = if let Some(id) = cmd_id {
        id
    } else {
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

        if !already_dispatched {
            if let Err(e) = state.conn.reducers.create_tool_command(
                tool_call.id.clone(),
                message_id.to_string(),
                session_id.to_string(),
                agent_id.to_string(),
                tool_call.function.name.clone(),
                tool_call.function.arguments.clone(),
                "pending".to_string(),
            ) {
                state.conn.db.tool_command().remove_on_insert(insert_cb);
                return Err(anyhow::anyhow!("Failed to create tool command: {e}"));
            }
        }

        match tokio::time::timeout(std::time::Duration::from_secs(10), cmd_rx).await {
            Ok(Ok(id)) => {
                state.conn.db.tool_command().remove_on_insert(insert_cb);
                cmd_create_ms = dispatch_start.elapsed().as_millis() as u64;
                id
            }
            _ => {
                state.conn.db.tool_command().remove_on_insert(insert_cb);
                if let Some(id) = find_cmd_id_in_cache(&state.conn.db, &tool_call.id) {
                    cmd_create_ms = dispatch_start.elapsed().as_millis() as u64;
                    id
                } else {
                    return Ok("Tool command was not created (agent may be offline)".to_string());
                }
            }
        }
    };

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
        let total_ms = dispatch_start.elapsed().as_millis() as u64;
        tracing::info!(
            session_id,
            tool = tool_call.function.name,
            cmd_create_ms,
            total_ms,
            success = result.0,
            output_len = result.1.len(),
            source = "cache_hit",
            "Tool dispatch complete"
        );
        return format_tool_result(result);
    }

    let exec_start = Instant::now();
    let result = wait_for_result(result_rx, &state.conn.db, cmd_id, cancel_flag).await;
    state.conn.db.tool_result().remove_on_insert(result_cb);

    if cancel_flag.load(Ordering::SeqCst) {
        let _ = state
            .conn
            .reducers
            .update_tool_command_status(cmd_id, "error".to_string());
        return Err(anyhow::anyhow!("Generation stopped by user"));
    }

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

fn find_cmd_id_in_cache(
    db: &module_bindings::RemoteTables,
    tool_call_id: &str,
) -> Option<u64> {
    db.tool_command()
        .iter()
        .find(|c| c.tool_call_id == tool_call_id)
        .map(|c| c.id)
}

type ToolResult = (bool, String, Option<String>);

async fn wait_for_result(
    mut callback_rx: tokio::sync::oneshot::Receiver<ToolResult>,
    db: &module_bindings::RemoteTables,
    cmd_id: u64,
    cancel_flag: &AtomicBool,
) -> Option<ToolResult> {
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(120);
    let mut poll_interval = tokio::time::interval(std::time::Duration::from_millis(500));
    poll_interval.tick().await;

    loop {
        if cancel_flag.load(Ordering::SeqCst) {
            return check_result_cache(db, cmd_id);
        }
        tokio::select! {
            res = &mut callback_rx => {
                return res.ok();
            }
            _ = poll_interval.tick() => {
                if cancel_flag.load(Ordering::SeqCst) {
                    return check_result_cache(db, cmd_id);
                }
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
        let output = if output.len() > 10000 {
            let boundary = output.char_indices()
                .take_while(|(i, _)| *i <= 10000)
                .last()
                .map(|(i, c)| i + c.len_utf8())
                .unwrap_or(0);
            format!("{}... (truncated, {} total chars)", &output[..boundary], output.chars().count())
        } else {
            output
        };
        Ok(output)
    } else {
        Ok(format!("Tool error: {}", error.unwrap_or(output)))
    }
}
