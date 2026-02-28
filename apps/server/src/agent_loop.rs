use anyhow::Result;
use spacetimedb_sdk::Table;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tracing::info;

use crate::history::fetch_history;
use crate::module_bindings::agent_table::AgentTableAccess;
use crate::module_bindings::complete_message_reducer::complete_message;
use crate::module_bindings::create_verification_reducer::create_verification;
use crate::module_bindings::fail_message_reducer::fail_message;
use crate::module_bindings::message_table::MessageTableAccess;
use crate::module_bindings::send_message_reducer::send_message;
use crate::module_bindings::session_table::SessionTableAccess;
use crate::module_bindings::update_session_status_reducer::update_session_status;
use crate::prompts::build_system_prompt;
use crate::module_bindings::set_message_tokens_reducer::set_message_tokens;
use crate::state::{AppState, LLMMessage, LLMRequest, LLMResult, ProviderPreferences, QueuedMessage, TokenUsage};
use crate::streaming::stream_llm_response;
use crate::tools::{dispatch_tool_call, tool_definitions};

const VERIFICATION_MODEL: &str = "google/gemini-3-flash-preview:nitro";
const MAX_VERIFICATION_ROUNDS: u32 = 3;

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

        if let Err(e) = run_agent_loop(state, session_id, &queued.content, &queued.owner_token, &cancel_flag).await {
            if cancel_flag.load(Ordering::SeqCst) {
                info!("Generation stopped by user for session {session_id}");
            } else {
                tracing::error!("Agent loop failed for session {session_id}: {e}");
            }
            for msg in state.conn.db.message().iter() {
                if msg.session_id == session_id && msg.status == "streaming" {
                    if cancel_flag.load(Ordering::SeqCst) {
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

fn has_online_agent(state: &AppState) -> bool {
    let observed = state.agent_heartbeat_observed.lock().unwrap();
    let now = std::time::Instant::now();
    state.conn.db.agent().iter().any(|a| {
        a.status == "online"
            && observed
                .get(&a.id)
                .map(|t| now.duration_since(*t) < std::time::Duration::from_secs(90))
                .unwrap_or(false)
    })
}

pub fn find_online_agent(state: &AppState, owner_token: &str) -> Option<(String, String)> {
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
        .map(|a| (a.id.clone(), a.workdir.clone()))
}

fn find_agent_id(state: &AppState, owner_token: &str) -> Option<String> {
    find_online_agent(state, owner_token).map(|(id, _)| id)
}

async fn run_agent_loop(
    state: &AppState,
    session_id: &str,
    user_message: &str,
    owner_token: &str,
    cancel_flag: &AtomicBool,
) -> Result<()> {
    let mut history = fetch_history(&state.conn, session_id);
    let use_tools = find_online_agent(state, owner_token).is_some();

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

    let session = state.conn.db.session().id().find(&session_id.to_string());
    let session_model = session.as_ref().and_then(|s| s.model.clone());
    let custom_system_prompt = session.as_ref().and_then(|s| s.system_prompt.clone());

    let agent_workdir = if use_tools {
        find_online_agent(state, owner_token).map(|(_, w)| w)
    } else {
        None
    };
    let mut system_prompt = build_system_prompt(use_tools, agent_workdir.as_deref());

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

    let last_is_user = conversation.last().map_or(false, |m| {
        m.role == "user" && m.content.as_deref() == Some(user_message)
    });
    if !last_is_user {
        conversation.push(LLMMessage {
            role: "user".to_string(),
            content: Some(user_message.to_string()),
            tool_calls: None,
            tool_call_id: None,
        });
    }

    let loop_start = Instant::now();
    let max_iterations = 20;
    let mut verification_rounds: u32 = 0;
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
            Some(tool_definitions())
        } else {
            None
        };

        let model_ref = session_model.as_deref();
        let llm_start = Instant::now();
        let mut result = stream_llm_response(
            state,
            session_id,
            &conversation,
            &assistant_msg_id,
            tools.clone(),
            model_ref,
        )
        .await?;
        let llm_ms = llm_start.elapsed().as_millis() as u64;

        if matches!(&result, LLMResult::TextComplete(t, _) if t.trim().is_empty()) {
            tracing::warn!(session_id, "LLM returned empty text, retrying with nudge");
            let mut nudged = conversation.clone();
            nudged.push(LLMMessage {
                role: "user".to_string(),
                content: Some("Please respond with a text answer.".to_string()),
                tool_calls: None,
                tool_call_id: None,
            });
            result = stream_llm_response(
                state,
                session_id,
                &nudged,
                &assistant_msg_id,
                tools,
                model_ref,
            )
            .await?;
        }

        match result {
            LLMResult::TextComplete(text, usage) => {
                state
                    .conn
                    .reducers
                    .complete_message(assistant_msg_id.clone())
                    .map_err(|e| anyhow::anyhow!("Failed to complete message: {e}"))?;

                store_token_usage(state, &assistant_msg_id, usage);

                conversation.push(LLMMessage {
                    role: "assistant".to_string(),
                    content: Some(text.clone()),
                    tool_calls: None,
                    tool_call_id: None,
                });

                if verification_rounds < MAX_VERIFICATION_ROUNDS && use_tools {
                    if let Some(verdict) = run_verification(
                        state,
                        session_id,
                        user_message,
                        &text,
                        use_tools,
                    ).await {
                        let _ = state.conn.reducers.create_verification(
                            session_id.to_string(),
                            assistant_msg_id.clone(),
                            verdict.completed,
                            verdict.reason.clone(),
                        );

                        if !verdict.completed {
                            verification_rounds += 1;
                            let reason = verdict.reason.unwrap_or_else(|| "Task appears incomplete".to_string());
                            info!(
                                session_id,
                                iteration,
                                verification_rounds,
                                reason = %reason,
                                "Verification failed, continuing agent loop"
                            );
                            conversation.push(LLMMessage {
                                role: "user".to_string(),
                                content: Some(format!(
                                    "[Verification check: your response did not fully complete the task. Reason: {reason}. Please continue and finish what was asked.]"
                                )),
                                tool_calls: None,
                                tool_call_id: None,
                            });
                            continue;
                        }
                    }
                }

                info!(
                    session_id,
                    iteration,
                    llm_ms,
                    verification_rounds,
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

                if let Err(e) = state.conn.reducers.update_session_status(
                    session_id.to_string(),
                    "waiting_for_tool".to_string(),
                ) {
                    tracing::warn!(session_id, "Failed to set session to waiting_for_tool: {e}");
                }

                let agent_id = find_agent_id(state, owner_token).unwrap_or_default();
                let tools_start = Instant::now();

                if cancel_flag.load(Ordering::SeqCst) {
                    return Err(anyhow::anyhow!("Generation stopped by user"));
                }

                let futures: Vec<_> = tool_calls
                    .iter()
                    .map(|tc| {
                        let session_id = session_id.to_string();
                        let assistant_msg_id = assistant_msg_id.clone();
                        let agent_id = agent_id.clone();
                        let tool_start = Instant::now();
                        async move {
                            let result = dispatch_tool_call(
                                state,
                                &session_id,
                                &assistant_msg_id,
                                &agent_id,
                                tc,
                            )
                            .await;
                            let ms = tool_start.elapsed().as_millis() as u64;
                            (tc, result, ms)
                        }
                    })
                    .collect();

                let results = futures::future::join_all(futures).await;

                for (tc, _, ms) in &results {
                    info!(
                        session_id,
                        iteration,
                        tool = tc.function.name,
                        tool_ms = ms,
                        "Tool call completed"
                    );
                }

                for (tc, result, _) in results {
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
                    llm_ms,
                    tools_ms = tools_start.elapsed().as_millis() as u64,
                    tool_count = tool_calls.len(),
                    iter_ms = iter_start.elapsed().as_millis() as u64,
                    "Iteration complete (tool calls)"
                );

                if let Err(e) = state.conn.reducers.update_session_status(
                    session_id.to_string(),
                    "streaming".to_string(),
                ) {
                    tracing::warn!(session_id, "Failed to set session back to streaming: {e}");
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
            tracing::warn!("Hit max iterations for session {session_id}");
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

#[derive(serde::Deserialize)]
struct VerificationResponse {
    completed: bool,
    #[serde(default)]
    reason: Option<String>,
}

#[derive(serde::Deserialize)]
struct ChatCompletion {
    choices: Vec<ChatChoice>,
}

#[derive(serde::Deserialize)]
struct ChatChoice {
    message: ChatChoiceMessage,
}

#[derive(serde::Deserialize)]
struct ChatChoiceMessage {
    content: Option<String>,
}

async fn run_verification(
    state: &AppState,
    session_id: &str,
    user_message: &str,
    assistant_response: &str,
    use_tools: bool,
) -> Option<VerificationResponse> {
    let verification_start = Instant::now();

    let prompt = format!(
        "You are a task completion verifier. Your job is to check whether the assistant fully completed the user's request.\n\
        \n\
        RULES:\n\
        1. If the user asked a question and got a clear answer, that's COMPLETED.\n\
        2. If the user asked for code changes or actions, check that the assistant actually did them (not just described what to do).\n\
        3. If the assistant said it will do something but hasn't done it yet, that's NOT completed.\n\
        4. If the assistant asked a clarifying question, that's COMPLETED (it's the right move).\n\
        5. Simple greetings, acknowledgments, or casual conversation are always COMPLETED.\n\
        {tools_note}\
        \n\
        Respond with ONLY valid JSON, no markdown, no explanation:\n\
        {{\"completed\": true}} or {{\"completed\": false, \"reason\": \"brief explanation of what's missing\"}}\n\
        \n\
        USER REQUEST:\n{user_message}\n\
        \n\
        ASSISTANT RESPONSE:\n{assistant_response}",
        tools_note = if use_tools {
            "6. If the user asked for file operations or code changes and the assistant used tools to do them, that's COMPLETED.\n\
             7. If the assistant only talked about what it would do without actually calling tools, that's NOT completed.\n"
        } else {
            ""
        }
    );

    let body = LLMRequest {
        model: VERIFICATION_MODEL.to_string(),
        stream: false,
        messages: vec![LLMMessage {
            role: "user".to_string(),
            content: Some(prompt),
            tool_calls: None,
            tool_call_id: None,
        }],
        tools: None,
        temperature: 0.0,
        max_tokens: 200,
        provider: Some(ProviderPreferences {
            order: None,
            ignore: None,
            allow_fallbacks: Some(true),
            require_parameters: None,
            sort: None,
        }),
    };

    let response = match state
        .http
        .post("https://openrouter.ai/api/v1/chat/completions")
        .timeout(std::time::Duration::from_secs(15))
        .header("Authorization", format!("Bearer {}", state.openrouter_key))
        .header("HTTP-Referer", "https://code.stoff.dev")
        .header("X-Title", "Relay")
        .json(&body)
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => {
            tracing::warn!(session_id, status = %r.status(), "Verification LLM request failed");
            return None;
        }
        Err(e) => {
            tracing::warn!(session_id, "Verification request error: {e}");
            return None;
        }
    };

    let completion: ChatCompletion = match response.json().await {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(session_id, "Failed to parse verification response: {e}");
            return None;
        }
    };

    let content = completion.choices.first()?.message.content.as_ref()?;

    let cleaned = content.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();

    let result: VerificationResponse = match serde_json::from_str(cleaned) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!(session_id, raw = %content, "Failed to parse verification JSON: {e}");
            return None;
        }
    };

    info!(
        session_id,
        completed = result.completed,
        reason = result.reason.as_deref().unwrap_or(""),
        ms = verification_start.elapsed().as_millis() as u64,
        "Verification complete"
    );

    Some(result)
}
