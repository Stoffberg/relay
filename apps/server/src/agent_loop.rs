use anyhow::Result;
use spacetimedb_sdk::Table;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tracing::info;

use crate::history::fetch_history;
use crate::module_bindings::agent_table::AgentTableAccess;
use crate::module_bindings::complete_message_reducer::complete_message;
use crate::module_bindings::create_tool_command_reducer::create_tool_command;
use crate::module_bindings::fail_message_reducer::fail_message;
use crate::module_bindings::finalize_tool_command_reducer::finalize_tool_command;
use crate::module_bindings::message_table::MessageTableAccess;
use crate::module_bindings::send_message_reducer::send_message;
use crate::module_bindings::session_table::SessionTableAccess;
use crate::module_bindings::set_message_tokens_reducer::set_message_tokens;
use crate::module_bindings::tool_command_table::ToolCommandTableAccess;
use crate::module_bindings::update_session_status_reducer::update_session_status;
use crate::module_bindings::update_tool_command_status_reducer::update_tool_command_status;
use crate::prompts::build_system_prompt;
use crate::state::{
    AppState, LLMMessage, LLMResult, QueuedMessage, TokenUsage, ToolCall,
};
use crate::streaming::stream_llm_response;
use crate::tools::{dispatch_tool_call, execute_wait, is_wait_tool_call, tool_definitions};

pub async fn run_session_queue(
    state: &AppState,
    session_id: &str,
    mut rx: tokio::sync::mpsc::Receiver<QueuedMessage>,
) {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    state
        .cancel_tokens
        .lock()
        .unwrap()
        .insert(session_id.to_string(), cancel_flag.clone());

    loop {
        let queued = match tokio::time::timeout(
            std::time::Duration::from_secs(5),
            rx.recv(),
        )
        .await
        {
            Ok(Some(msg)) => msg,
            Ok(None) => break,
            Err(_) => break,
        };

        cancel_flag.store(false, Ordering::SeqCst);
        let msg_start = Instant::now();

        if let Err(e) = state.conn.reducers.complete_message(queued.id.clone()) {
            tracing::warn!(session_id, "Failed to complete user message: {e}");
        }

        if let Err(e) = state
            .conn
            .reducers
            .update_session_status(session_id.to_string(), "streaming".to_string())
        {
            tracing::warn!(session_id, "Failed to set session to streaming: {e}");
        }

        if let Err(e) = run_agent_loop(
            state,
            session_id,
            &queued.content,
            &queued.owner_token,
            queued.model.as_deref(),
            &cancel_flag,
        )
        .await
        {
            let was_cancelled = cancel_flag.load(Ordering::SeqCst);
            if was_cancelled {
                info!("Generation stopped by user for session {session_id}");
            } else {
                tracing::error!("Agent loop failed for session {session_id}: {e}");
            }
            for msg in state.conn.db.message().iter() {
                if msg.session_id == session_id && msg.status == "streaming" {
                    if was_cancelled {
                        let _ = state.conn.reducers.complete_message(msg.id.clone());
                    } else if let Err(e2) = state
                        .conn
                        .reducers
                        .fail_message(msg.id.clone(), format!("Processing failed: {e}"))
                    {
                        tracing::warn!(session_id, "Failed to mark message as failed: {e2}");
                    }
                }
            }
            if was_cancelled {
                for cmd in state.conn.db.tool_command().iter() {
                    if cmd.session_id == session_id
                        && (cmd.status == "pending"
                            || cmd.status == "executing"
                            || cmd.status == "generating")
                    {
                        let _ = state
                            .conn
                            .reducers
                            .update_tool_command_status(cmd.id, "error".to_string());
                    }
                }
            }
        }

        info!(
            session_id,
            elapsed_ms = msg_start.elapsed().as_millis() as u64,
            "Message processed"
        );

        if let Err(e) = state
            .conn
            .reducers
            .update_session_status(session_id.to_string(), "idle".to_string())
        {
            tracing::warn!(session_id, "Failed to set session to idle: {e}");
        }
    }

    if let Err(e) = state
        .conn
        .reducers
        .update_session_status(session_id.to_string(), "idle".to_string())
    {
        tracing::warn!(session_id, "Failed to set session to idle: {e}");
    }

    state.cancel_tokens.lock().unwrap().remove(session_id);
    state.active_sessions.lock().unwrap().remove(session_id);
}

fn store_token_usage(state: &AppState, message_id: &str, usage: Option<TokenUsage>) {
    if let Some(u) = usage {
        if let Err(e) = state
            .conn
            .reducers
            .set_message_tokens(message_id.to_string(), u.prompt_tokens, u.completion_tokens)
        {
            tracing::warn!("Failed to store token usage for {message_id}: {e}");
        }
    }
}

#[derive(Clone)]
pub struct AgentInfo {
    pub id: String,
    pub workdir: String,
    pub workspace_tree: String,
}

pub fn find_online_agent(state: &AppState, owner_token: &str) -> Option<AgentInfo> {
    let observed = state.agent_heartbeat_observed.lock().unwrap();
    let now = std::time::Instant::now();
    state
        .conn
        .db
        .agent()
        .iter()
        .find(|a| {
            a.status == "online"
                && a.owner_token == owner_token
                && observed
                    .get(&a.id)
                    .map(|t| now.duration_since(*t) < std::time::Duration::from_secs(90))
                    .unwrap_or(false)
        })
        .map(|a| AgentInfo {
            id: a.id.clone(),
            workdir: a.workdir.clone(),
            workspace_tree: a.workspace_tree.clone(),
        })
}

const EXPLORE_TOOL_NAME: &str = "explore";

fn read_only_tool_names() -> &'static [&'static str] {
    &["file_read", "grep", "glob"]
}

fn explore_system_prompt(workspace_tree: Option<&str>, workdir: Option<&str>) -> String {
    let mut prompt = String::from(
        "You are an exploration agent. Your job is to quickly find information in the codebase and return a structured report.\n\
        \n\
        RULES:\n\
        1. Locate, don't analyze. Find the relevant files, lines, and content, then report what you found.\n\
        2. Use grep to search for patterns. Use file_read to read specific files. Use glob to find files by pattern.\n\
        3. Be thorough but fast. Call multiple tools in a single response when possible.\n\
        4. Return a clear, factual report of what you found. Include file paths and line numbers.\n\
        5. No opinions, no suggestions, no speculation. Just the facts.\n\
        6. Keep your final answer concise. File paths with brief descriptions of what's at each location."
    );
    if let Some(workdir) = workdir {
        prompt.push_str(&format!("\n\nWorking directory: `{}`", workdir));
    }
    if let Some(tree) = workspace_tree {
        if !tree.is_empty() {
            prompt.push_str(&format!(
                "\n\nFile tree:\n```\n{}\n```",
                tree
            ));
        }
    }
    prompt
}

async fn run_explore_subagent(
    state: &AppState,
    session_id: &str,
    query: &str,
    agent_info: &AgentInfo,
    cancel_flag: &AtomicBool,
) -> Result<String> {
    let explore_model = match &state.exploration_model {
        Some(m) => m.clone(),
        None => return Ok("Explore subagent not configured (no exploration model set)".to_string()),
    };

    let workspace_tree = if agent_info.workspace_tree.is_empty() {
        None
    } else {
        Some(agent_info.workspace_tree.as_str())
    };

    let system_prompt = explore_system_prompt(workspace_tree, Some(&agent_info.workdir));

    let read_only: Vec<_> = tool_definitions()
        .into_iter()
        .filter(|t| read_only_tool_names().contains(&t.function.name.as_str()))
        .collect();

    let mut conversation = vec![
        LLMMessage {
            role: "system".to_string(),
            content: Some(system_prompt),
            tool_calls: None,
            tool_call_id: None,
        },
        LLMMessage {
            role: "user".to_string(),
            content: Some(query.to_string()),
            tool_calls: None,
            tool_call_id: None,
        },
    ];

    let max_iterations = 8;
    let explore_start = Instant::now();

    for iteration in 0..max_iterations {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err(anyhow::anyhow!("Explore cancelled by user"));
        }

        let explore_msg_id = uuid::Uuid::new_v4().to_string();
        if let Err(e) = state.conn.reducers.send_message(
            explore_msg_id.clone(),
            session_id.to_string(),
            "explore".to_string(),
            "streaming".to_string(),
        ) {
            tracing::error!("Failed to create explore message: {e}");
            return Err(anyhow::anyhow!("Failed to create explore message"));
        }

        let early_dispatched: Arc<std::sync::Mutex<std::collections::HashSet<String>>> =
            Arc::new(std::sync::Mutex::new(std::collections::HashSet::new()));
        let conn = &state.conn;
        let mid = explore_msg_id.clone();
        let sid = session_id.to_string();
        let aid = agent_info.id.clone();
        let dispatched = early_dispatched.clone();
        let early_dispatch: Option<crate::streaming::EarlyDispatchFn<'_>> =
            Some(Box::new(move |tc: &ToolCall| {
                if conn
                    .reducers
                    .create_tool_command(
                        tc.id.clone(),
                        mid.clone(),
                        sid.clone(),
                        aid.clone(),
                        tc.function.name.clone(),
                        tc.function.arguments.clone(),
                        "pending".to_string(),
                    )
                    .is_ok()
                {
                    dispatched.lock().unwrap().insert(tc.id.clone());
                }
            }));

        let result = stream_llm_response(
            state,
            session_id,
            &conversation,
            &explore_msg_id,
            Some(read_only.clone()),
            Some(&explore_model),
            early_dispatch,
            None,
            true,
            Some(cancel_flag),
        )
        .await?;

        match result {
            LLMResult::TextComplete(text, usage) => {
                store_token_usage(state, &explore_msg_id, usage);
                let _ = state.conn.reducers.complete_message(explore_msg_id);
                let ms = explore_start.elapsed().as_millis() as u64;
                info!(
                    session_id,
                    iteration,
                    ms,
                    text_len = text.len(),
                    "Explore subagent complete"
                );
                return Ok(text);
            }
            LLMResult::ToolCalls(text, tool_calls, usage) => {
                store_token_usage(state, &explore_msg_id, usage);
                let _ = state.conn.reducers.complete_message(explore_msg_id.clone());

                conversation.push(LLMMessage {
                    role: "assistant".to_string(),
                    content: if text.is_empty() { None } else { Some(text) },
                    tool_calls: Some(tool_calls.clone()),
                    tool_call_id: None,
                });

                let dispatched_set = early_dispatched.lock().unwrap().clone();

                let futures: Vec<_> = tool_calls
                    .iter()
                    .map(|tc| {
                        let session_id = session_id.to_string();
                        let explore_msg_id = explore_msg_id.clone();
                        let agent_id = agent_info.id.clone();
                        let already_dispatched = dispatched_set.contains(&tc.id);
                        async move {
                            let result = dispatch_tool_call(
                                state,
                                &session_id,
                                &explore_msg_id,
                                &agent_id,
                                tc,
                                already_dispatched,
                                cancel_flag,
                            )
                            .await;
                            (tc, result)
                        }
                    })
                    .collect();

                let results = futures::future::join_all(futures).await;

                for (tc, result) in results {
                    let tool_result = result?;
                    conversation.push(LLMMessage {
                        role: "tool".to_string(),
                        content: Some(tool_result),
                        tool_calls: None,
                        tool_call_id: Some(tc.id.clone()),
                    });
                }

                info!(
                    session_id,
                    iteration,
                    tool_count = tool_calls.len(),
                    ms = explore_start.elapsed().as_millis() as u64,
                    "Explore iteration complete"
                );
            }
            LLMResult::Error(e) => {
                let _ = state.conn.reducers.fail_message(explore_msg_id, e.clone());
                return Ok(format!("Explore failed: {e}"));
            }
        }
    }

    let final_text: String = conversation
        .iter()
        .filter(|m| m.role == "tool")
        .filter_map(|m| m.content.clone())
        .collect::<Vec<_>>()
        .join("\n---\n");

    Ok(if final_text.is_empty() {
        "Explore subagent completed but found no results.".to_string()
    } else {
        final_text
    })
}

fn is_explore_tool_call(tc: &ToolCall) -> bool {
    tc.function.name == EXPLORE_TOOL_NAME
}

fn parse_explore_query(tc: &ToolCall) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(&tc.function.arguments)
        .ok()
        .and_then(|v| v.get("query").and_then(|q| q.as_str().map(String::from)))
}

async fn run_agent_loop(
    state: &AppState,
    session_id: &str,
    user_message: &str,
    owner_token: &str,
    queued_model: Option<&str>,
    cancel_flag: &AtomicBool,
) -> Result<()> {
    let mut history = fetch_history(&state.conn, session_id);
    let agent_info = find_online_agent(state, owner_token);
    let use_tools = agent_info.is_some();

    let max_history_chars: usize = 600_000;
    let total_chars: usize = history
        .iter()
        .map(|m| m.content.as_ref().map(|c| c.len()).unwrap_or(0))
        .sum();
    if total_chars > max_history_chars {
        let mut budget = max_history_chars;
        let mut keep_from = history.len();
        for (i, msg) in history.iter().enumerate().rev() {
            let msg_chars = msg.content.as_ref().map(|c| c.len()).unwrap_or(0);
            if msg_chars > budget {
                keep_from = i + 1;
                break;
            }
            budget -= msg_chars;
        }
        if keep_from > 0 {
            let mut trimmed: Vec<LLMMessage> = history.into_iter().skip(keep_from).collect();

            let tool_call_ids: std::collections::HashSet<String> = trimmed
                .iter()
                .filter_map(|m| m.tool_calls.as_ref())
                .flatten()
                .map(|tc| tc.id.clone())
                .collect();

            let tool_result_ids: std::collections::HashSet<String> = trimmed
                .iter()
                .filter(|m| m.role == "tool")
                .filter_map(|m| m.tool_call_id.clone())
                .collect();

            trimmed.retain(|msg| {
                if msg.role == "tool" {
                    msg.tool_call_id
                        .as_ref()
                        .map(|id| tool_call_ids.contains(id))
                        .unwrap_or(false)
                } else if let Some(ref calls) = msg.tool_calls {
                    calls.iter().any(|tc| tool_result_ids.contains(&tc.id))
                        || msg.content.is_some()
                } else {
                    true
                }
            });

            trimmed.insert(
                0,
                LLMMessage {
                    role: "system".to_string(),
                    content: Some(
                        "[Earlier conversation history omitted to fit context window]".to_string(),
                    ),
                    tool_calls: None,
                    tool_call_id: None,
                },
            );
            history = trimmed;
        }
    }

    let session = state
        .conn
        .db
        .session()
        .id()
        .find(&session_id.to_string());
    let session_model = queued_model
        .map(|m| m.to_string())
        .or_else(|| session.as_ref().and_then(|s| s.model.clone()));
    let custom_system_prompt = session.as_ref().and_then(|s| s.system_prompt.clone());

    let (agent_workdir, workspace_tree) = if let Some(ref info) = agent_info {
        (
            Some(info.workdir.as_str()),
            if info.workspace_tree.is_empty() {
                None
            } else {
                Some(info.workspace_tree.as_str())
            },
        )
    } else {
        (None, None)
    };

    let has_explore = state.exploration_model.is_some() && use_tools;
    let mut system_prompt = build_system_prompt(use_tools, has_explore, agent_workdir, workspace_tree);

    if let Some(ref custom) = custom_system_prompt {
        if !custom.is_empty() {
            system_prompt.push_str("\n\nAdditional instructions from user:\n");
            system_prompt.push_str(custom);
        }
    }

    let mut conversation = vec![LLMMessage {
        role: "system".to_string(),
        content: Some(system_prompt),
        tool_calls: None,
        tool_call_id: None,
    }];
    conversation.extend(history);

    let last_is_user = conversation
        .last()
        .is_some_and(|m| m.role == "user" && m.content.as_deref() == Some(user_message));
    if !last_is_user {
        conversation.push(LLMMessage {
            role: "user".to_string(),
            content: Some(user_message.to_string()),
            tool_calls: None,
            tool_call_id: None,
        });
    }

    let loop_start = Instant::now();
    let max_iterations: usize = 20;

    for iteration in 0..max_iterations {
        if cancel_flag.load(Ordering::SeqCst) {
            return Err(anyhow::anyhow!("Generation stopped by user"));
        }

        let iter_start = Instant::now();
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
            let mut t = tool_definitions();
            if has_explore {
                t.push(explore_tool_definition());
            }
            if iteration == 0 {
                let names: Vec<&str> = t.iter().map(|td| td.function.name.as_str()).collect();
                info!(session_id, ?names, has_explore, "Tools sent to LLM");
            }
            Some(t)
        } else {
            None
        };

        let early_dispatched: Arc<std::sync::Mutex<std::collections::HashSet<String>>> =
            Arc::new(std::sync::Mutex::new(std::collections::HashSet::new()));
        let early_notified: Arc<std::sync::Mutex<std::collections::HashSet<String>>> =
            Arc::new(std::sync::Mutex::new(std::collections::HashSet::new()));

        let early_notify: Option<crate::streaming::EarlyDispatchFn<'_>> = if use_tools {
            let conn = &state.conn;
            let mid = assistant_msg_id.clone();
            let sid = session_id.to_string();
            let aid = agent_info.as_ref().map(|a| a.id.clone()).unwrap_or_default();
            let notified = early_notified.clone();
            Some(Box::new(move |tc: &ToolCall| {
                if tc.function.name == EXPLORE_TOOL_NAME || is_wait_tool_call(tc) {
                    return;
                }
                if conn
                    .reducers
                    .create_tool_command(
                        tc.id.clone(),
                        mid.clone(),
                        sid.clone(),
                        aid.clone(),
                        tc.function.name.clone(),
                        String::new(),
                        "generating".to_string(),
                    )
                    .is_ok()
                {
                    notified.lock().unwrap().insert(tc.id.clone());
                }
            }))
        } else {
            None
        };

        let early_dispatch: Option<crate::streaming::EarlyDispatchFn<'_>> = if use_tools {
            let conn = &state.conn;
            let mid = assistant_msg_id.clone();
            let sid = session_id.to_string();
            let aid = agent_info.as_ref().map(|a| a.id.clone()).unwrap_or_default();
            let notified = early_notified.clone();
            let dispatched = early_dispatched.clone();
            Some(Box::new(move |tc: &ToolCall| {
                if tc.function.name == EXPLORE_TOOL_NAME || is_wait_tool_call(tc) {
                    return;
                }
                let ok = if notified.lock().unwrap().contains(&tc.id) {
                    conn.reducers
                        .finalize_tool_command(
                            tc.id.clone(),
                            tc.function.arguments.clone(),
                        )
                        .is_ok()
                } else {
                    conn.reducers
                        .create_tool_command(
                            tc.id.clone(),
                            mid.clone(),
                            sid.clone(),
                            aid.clone(),
                            tc.function.name.clone(),
                            tc.function.arguments.clone(),
                            "pending".to_string(),
                        )
                        .is_ok()
                };
                if ok {
                    dispatched.lock().unwrap().insert(tc.id.clone());
                }
            }))
        } else {
            None
        };

        let llm_start = Instant::now();
        let result = stream_llm_response(
            state,
            session_id,
            &conversation,
            &assistant_msg_id,
            tools.clone(),
            session_model.as_deref(),
            early_dispatch,
            early_notify,
            false,
            Some(cancel_flag),
        )
        .await?;
        let llm_ms = llm_start.elapsed().as_millis() as u64;

        let model_used = session_model.as_deref().unwrap_or(&state.openrouter_model);
        info!(
            session_id,
            iteration,
            llm_ms,
            model = model_used,
            "LLM response received"
        );

        match result {
            LLMResult::TextComplete(_text, usage) => {
                state
                    .conn
                    .reducers
                    .complete_message(assistant_msg_id.clone())
                    .map_err(|e| anyhow::anyhow!("Failed to complete message: {e}"))?;

                store_token_usage(state, &assistant_msg_id, usage);

                info!(
                    session_id,
                    iteration,
                    llm_ms,
                    model = model_used,
                    iter_ms = iter_start.elapsed().as_millis() as u64,
                    total_ms = loop_start.elapsed().as_millis() as u64,
                    "Agent loop complete (text)"
                );
                break;
            }
            LLMResult::ToolCalls(text, tool_calls, usage) => {
                state
                    .conn
                    .reducers
                    .complete_message(assistant_msg_id.clone())
                    .map_err(|e| anyhow::anyhow!("Failed to complete message: {e}"))?;

                store_token_usage(state, &assistant_msg_id, usage);

                conversation.push(LLMMessage {
                    role: "assistant".to_string(),
                    content: if text.is_empty() { None } else { Some(text) },
                    tool_calls: Some(tool_calls.clone()),
                    tool_call_id: None,
                });

                let (explore_calls, rest): (Vec<&ToolCall>, Vec<&ToolCall>) =
                    tool_calls.iter().partition(|tc| is_explore_tool_call(tc));
                let (wait_calls, agent_calls): (Vec<&ToolCall>, Vec<&ToolCall>) =
                    rest.into_iter().partition(|tc| is_wait_tool_call(tc));

                if !agent_calls.is_empty() {
                    if let Err(e) = state.conn.reducers.update_session_status(
                        session_id.to_string(),
                        "waiting_for_tool".to_string(),
                    ) {
                        tracing::warn!(
                            session_id,
                            "Failed to set session to waiting_for_tool: {e}"
                        );
                    }
                }

                let agent_id =
                    agent_info.as_ref().map(|a| a.id.clone()).unwrap_or_default();
                let dispatched_set = early_dispatched.lock().unwrap().clone();
                let notified_set = early_notified.lock().unwrap().clone();

                if cancel_flag.load(Ordering::SeqCst) {
                    return Err(anyhow::anyhow!("Generation stopped by user"));
                }

                for tc in &agent_calls {
                    if notified_set.contains(&tc.id) && !dispatched_set.contains(&tc.id) {
                        let _ = state.conn.reducers.finalize_tool_command(
                            tc.id.clone(),
                            tc.function.arguments.clone(),
                        );
                    }
                }

                let agent_futures: Vec<_> = agent_calls
                    .iter()
                    .map(|tc| {
                        let session_id = session_id.to_string();
                        let assistant_msg_id = assistant_msg_id.clone();
                        let agent_id = agent_id.clone();
                        let already_dispatched =
                            dispatched_set.contains(&tc.id) || notified_set.contains(&tc.id);
                        let tool_start = Instant::now();
                        async move {
                            let result = dispatch_tool_call(
                                state,
                                &session_id,
                                &assistant_msg_id,
                                &agent_id,
                                tc,
                                already_dispatched,
                                cancel_flag,
                            )
                            .await;
                            let ms = tool_start.elapsed().as_millis() as u64;
                            (*tc, result, ms)
                        }
                    })
                    .collect();

                let explore_futures: Vec<_> = explore_calls
                    .iter()
                    .map(|tc| {
                        let query = parse_explore_query(tc)
                            .unwrap_or_else(|| "explore the codebase".to_string());
                        let explore_start = Instant::now();
                        let agent_info_clone = agent_info.clone();
                        async move {
                            let result = if let Some(ref info) = agent_info_clone {
                                match tokio::time::timeout(
                                    std::time::Duration::from_secs(180),
                                    run_explore_subagent(state, session_id, &query, info, cancel_flag),
                                ).await {
                                    Ok(r) => r,
                                    Err(_) => Ok("Explore timed out after 3 minutes".to_string()),
                                }
                            } else {
                                Ok("No agent available for exploration".to_string())
                            };
                            let ms = explore_start.elapsed().as_millis() as u64;
                            (*tc, result, ms)
                        }
                    })
                    .collect();

                let wait_futures: Vec<_> = wait_calls
                    .iter()
                    .map(|tc| {
                        let session_id = session_id.to_string();
                        let assistant_msg_id = assistant_msg_id.clone();
                        let wait_start = Instant::now();
                        async move {
                            let result = execute_wait(state, &session_id, &assistant_msg_id, tc, cancel_flag).await;
                            let ms = wait_start.elapsed().as_millis() as u64;
                            (*tc, result, ms)
                        }
                    })
                    .collect();

                let (agent_results, explore_results, wait_results) = tokio::join!(
                    futures::future::join_all(agent_futures),
                    futures::future::join_all(explore_futures),
                    futures::future::join_all(wait_futures),
                );

                for (tc, _, ms) in &agent_results {
                    info!(
                        session_id,
                        iteration,
                        tool = tc.function.name,
                        tool_ms = ms,
                        "Tool call completed"
                    );
                }

                for (_tc, _, ms) in &explore_results {
                    info!(
                        session_id,
                        iteration,
                        tool = "explore",
                        tool_ms = ms,
                        "Explore subagent completed"
                    );
                }

                for (tc, result, _) in agent_results {
                    let tool_result = result?;
                    conversation.push(LLMMessage {
                        role: "tool".to_string(),
                        content: Some(tool_result),
                        tool_calls: None,
                        tool_call_id: Some(tc.id.clone()),
                    });
                }

                for (tc, result, _) in explore_results {
                    let explore_result = result?;
                    conversation.push(LLMMessage {
                        role: "tool".to_string(),
                        content: Some(explore_result),
                        tool_calls: None,
                        tool_call_id: Some(tc.id.clone()),
                    });
                }

                for (tc, result, ms) in wait_results {
                    info!(
                        session_id,
                        iteration,
                        tool = "wait",
                        tool_ms = ms,
                        "Wait completed"
                    );
                    let wait_result = result?;
                    conversation.push(LLMMessage {
                        role: "tool".to_string(),
                        content: Some(wait_result),
                        tool_calls: None,
                        tool_call_id: Some(tc.id.clone()),
                    });
                }

                info!(
                    session_id,
                    iteration,
                    llm_ms,
                    tool_count = tool_calls.len(),
                    explore_count = explore_calls.len(),
                    model = model_used,
                    iter_ms = iter_start.elapsed().as_millis() as u64,
                    "Iteration complete (tool calls)"
                );

                if !agent_calls.is_empty() {
                    if let Err(e) = state.conn.reducers.update_session_status(
                        session_id.to_string(),
                        "streaming".to_string(),
                    ) {
                        tracing::warn!(
                            session_id,
                            "Failed to set session back to streaming: {e}"
                        );
                    }
                }
            }
            LLMResult::Error(e) => {
                if let Err(e2) = state
                    .conn
                    .reducers
                    .fail_message(assistant_msg_id, e.clone())
                {
                    tracing::warn!(session_id, "Failed to mark message as failed: {e2}");
                }
                return Err(anyhow::anyhow!("{e}"));
            }
        }

        if iteration == max_iterations - 1 {
            tracing::warn!(session_id, iteration, "Hit max iterations");
        }
    }

    info!(
        session_id,
        total_ms = loop_start.elapsed().as_millis() as u64,
        history_len = conversation.len(),
        "Agent loop finished"
    );

    Ok(())
}

use crate::state::{FunctionDefinition, ToolDefinition};

fn explore_tool_definition() -> ToolDefinition {
    ToolDefinition {
        tool_type: "function".to_string(),
        function: FunctionDefinition {
            name: EXPLORE_TOOL_NAME.to_string(),
            description: "Search and analyze the codebase in a single call. This tool reads multiple files, follows references across files, and returns a comprehensive report. Use this instead of making sequential file_read or grep calls when you need to understand code flow, trace function calls across files, compare implementations, or gather information from multiple locations. Returns in one round trip what would otherwise take many sequential tool calls.".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Describe what you need to find or understand. Examples: 'trace how chat messages flow from the HTTP handler through to the LLM call, show the function chain with file paths', 'find all environment variables read by the server and their default values', 'compare the tool definitions in tools.rs with the tool implementations in apps/agent/src/tools/'"
                    }
                },
                "required": ["query"]
            }),
        },
    }
}
