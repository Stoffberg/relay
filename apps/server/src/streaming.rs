use anyhow::Result;
use futures::StreamExt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use crate::module_bindings::append_message_part_reducer::append_message_part;
use crate::state::{
    AppState, LLMMessage, LLMRequest, LLMResult, ProviderPreferences, SSEChunk, TokenUsage,
    ToolCall, ToolCallFunction, ToolDefinition,
};

async fn fire_llm_request(
    state: &AppState,
    body: &LLMRequest,
) -> Result<reqwest::Response, (u16, String)> {
    let response = match state
        .http
        .post("https://openrouter.ai/api/v1/chat/completions")
        .timeout(std::time::Duration::from_secs(120))
        .header("Authorization", format!("Bearer {}", state.openrouter_key))
        .header("HTTP-Referer", "https://code.stoff.dev")
        .header("X-Title", "Relay")
        .json(body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return Err((0, format!("Request failed: {e}"))),
    };

    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }

    let code = status.as_u16();
    let text = response.text().await.unwrap_or_default();
    Err((code, text))
}

const HEDGE_PROVIDERS_A: &[&str] = &["Inceptron", "Chutes", "Parasail"];
const HEDGE_PROVIDERS_B: &[&str] = &["Chutes", "Fireworks", "Parasail"];

pub async fn send_llm_request(
    state: &AppState,
    session_id: &str,
    body: &LLMRequest,
) -> Result<reqwest::Response, (u16, String)> {
    let req_start = Instant::now();

    let mut body_a = body.clone();
    body_a.provider = Some(ProviderPreferences {
        order: Some(HEDGE_PROVIDERS_A.iter().map(|s| s.to_string()).collect()),
        ignore: Some(vec!["SambaNova".to_string()]),
        allow_fallbacks: Some(true),
        require_parameters: Some(true),
        sort: None,
    });

    let mut body_b = body.clone();
    body_b.provider = Some(ProviderPreferences {
        order: Some(HEDGE_PROVIDERS_B.iter().map(|s| s.to_string()).collect()),
        ignore: Some(vec!["SambaNova".to_string(), "Inceptron".to_string()]),
        allow_fallbacks: Some(true),
        require_parameters: Some(true),
        sort: None,
    });

    let fut_a = fire_llm_request(state, &body_a);
    let fut_b = fire_llm_request(state, &body_b);

    tokio::pin!(fut_a);
    tokio::pin!(fut_b);

    let mut a_done = false;
    let mut b_done = false;
    let mut last_error: Option<(u16, String)>;

    loop {
        tokio::select! {
            result = &mut fut_a, if !a_done => {
                a_done = true;
                match result {
                    Ok(response) => {
                        let connect_ms = req_start.elapsed().as_millis() as u64;
                        tracing::info!(session_id, connect_ms, hedge = "A", "LLM HTTP connected");
                        return Ok(response);
                    }
                    Err(e) => {
                        tracing::warn!(session_id, hedge = "A", code = e.0, "Hedge A failed");
                        last_error = Some(e);
                        if b_done {
                            return Err(last_error.unwrap());
                        }
                    }
                }
            }
            result = &mut fut_b, if !b_done => {
                b_done = true;
                match result {
                    Ok(response) => {
                        let connect_ms = req_start.elapsed().as_millis() as u64;
                        tracing::info!(session_id, connect_ms, hedge = "B", "LLM HTTP connected");
                        return Ok(response);
                    }
                    Err(e) => {
                        tracing::warn!(session_id, hedge = "B", code = e.0, "Hedge B failed");
                        last_error = Some(e);
                        if a_done {
                            return Err(last_error.unwrap());
                        }
                    }
                }
            }
        }
    }
}

pub type EarlyDispatchFn<'a> = Box<dyn Fn(&ToolCall) + Send + Sync + 'a>;

#[allow(clippy::too_many_arguments)]
pub async fn stream_llm_response<'a>(
    state: &'a AppState,
    session_id: &str,
    messages: &[LLMMessage],
    assistant_msg_id: &str,
    tools: Option<Vec<ToolDefinition>>,
    model_override: Option<&str>,
    early_dispatch: Option<EarlyDispatchFn<'a>>,
    early_notify: Option<EarlyDispatchFn<'a>>,
    suppress_text: bool,
    cancel_flag: Option<&AtomicBool>,
) -> Result<LLMResult> {
    let body = LLMRequest {
        model: model_override
            .map(|m| m.to_string())
            .unwrap_or_else(|| state.openrouter_model.clone()),
        stream: true,
        messages: messages.to_vec(),
        tools,
        temperature: state.llm_temperature,
        max_tokens: state.llm_max_tokens,
        provider: None,
    };

    let res = match send_llm_request(state, session_id, &body).await {
        Ok(response) => response,
        Err((code, text)) => {
            if let Some(ref fallback) = state.fallback_model {
                let is_transient = code == 0 || code == 429 || code >= 500;
                if is_transient {
                    tracing::warn!(
                        session_id,
                        primary = %body.model,
                        fallback = %fallback,
                        "Primary model failed with {code}, falling back"
                    );
                    let fallback_body = LLMRequest {
                        model: fallback.clone(),
                        ..body.clone()
                    };
                    match send_llm_request(state, session_id, &fallback_body).await {
                        Ok(response) => response,
                        Err((fb_code, fb_text)) => {
                            tracing::error!(session_id, "Fallback model also failed ({fb_code}): {fb_text}");
                            return Ok(LLMResult::Error(error_message(fb_code)));
                        }
                    }
                } else {
                    tracing::error!(session_id, "OpenRouter error {code}: {text}");
                    return Ok(LLMResult::Error(error_message(code)));
                }
            } else {
                tracing::error!(session_id, "OpenRouter error {code}: {text}");
                return Ok(LLMResult::Error(error_message(code)));
            }
        }
    };

    let mut stream = res.bytes_stream();
    let mut part_index: u32 = 0;
    let mut byte_buffer: Vec<u8> = Vec::new();
    let mut full_text = String::new();
    let mut tool_calls: Vec<ToolCall> = Vec::new();
    let mut dispatched: Vec<bool> = Vec::new();
    let mut notified: Vec<bool> = Vec::new();
    let mut finish_reason: Option<String> = None;
    let mut usage: Option<TokenUsage> = None;
    let stream_timeout = std::time::Duration::from_secs(60);
    let stream_start = Instant::now();
    let mut first_token_ms: Option<u64> = None;
    let mut chunk_count: u32 = 0;

    loop {
        if let Some(flag) = cancel_flag {
            if flag.load(Ordering::SeqCst) {
                tracing::info!(session_id, "Stream cancelled by user");
                return Ok(LLMResult::TextComplete(full_text, usage));
            }
        }

        let maybe_chunk = tokio::time::timeout(stream_timeout, stream.next()).await;

        let chunk = match maybe_chunk {
            Err(_) => {
                tracing::warn!(session_id, "Stream timed out (no data for 60s)");
                break;
            }
            Ok(None) => break,
            Ok(Some(c)) => c?,
        };
        chunk_count += 1;

        byte_buffer.extend_from_slice(&chunk);

        while let Some(newline_pos) = byte_buffer.iter().position(|&b| b == b'\n') {
            let line_bytes = byte_buffer[..newline_pos].to_vec();
            byte_buffer = byte_buffer[newline_pos + 1..].to_vec();
            let line = String::from_utf8_lossy(&line_bytes).trim().to_string();

            if line.is_empty() || !line.starts_with("data: ") {
                continue;
            }

            let data = &line[6..];
            if data == "[DONE]" {
                continue;
            }

            let chunk = match serde_json::from_str::<SSEChunk>(data) {
                Ok(c) => c,
                Err(e) => {
                    let preview = &data[..data.len().min(200)];
                    tracing::warn!(session_id, "Failed to parse SSE chunk: {e}. Data: {preview}");
                    continue;
                }
            };
            if let Some(u) = &chunk.usage {
                if let (Some(pt), Some(ct)) = (u.prompt_tokens, u.completion_tokens) {
                    usage = Some(TokenUsage {
                        prompt_tokens: pt,
                        completion_tokens: ct,
                    });
                }
            }
            if let Some(choice) = chunk.choices.first() {
                if let Some(reason) = &choice.finish_reason {
                    finish_reason = Some(reason.clone());
                }

                if let Some(delta) = &choice.delta {
                    if let Some(content) = &delta.content {
                        if !content.is_empty() {
                            if first_token_ms.is_none() {
                                first_token_ms = Some(stream_start.elapsed().as_millis() as u64);
                            }
                            full_text.push_str(content);
                            if !suppress_text {
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
                    }

                    if let Some(tc_deltas) = &delta.tool_calls {
                        for tc_delta in tc_deltas {
                            let idx = tc_delta.index.unwrap_or(0);
                            if idx > 50 {
                                return Err(anyhow::anyhow!(
                                    "Tool call index {idx} exceeds maximum of 50"
                                ));
                            }
                            while tool_calls.len() <= idx {
                                tool_calls.push(ToolCall {
                                    id: String::new(),
                                    call_type: "function".to_string(),
                                    function: ToolCallFunction {
                                        name: String::new(),
                                        arguments: String::new(),
                                    },
                                });
                                dispatched.push(false);
                                notified.push(false);
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

                            if let Some(notify) = &early_notify {
                                if !notified[idx]
                                    && !tool_calls[idx].id.is_empty()
                                    && !tool_calls[idx].function.name.is_empty()
                                {
                                    notified[idx] = true;
                                    notify(&tool_calls[idx]);
                                }
                            }

                            if let Some(dispatch) = &early_dispatch {
                                if !dispatched[idx]
                                    && !tool_calls[idx].id.is_empty()
                                    && !tool_calls[idx].function.name.is_empty()
                                    && serde_json::from_str::<serde_json::Value>(&tool_calls[idx].function.arguments).is_ok()
                                {
                                    dispatched[idx] = true;
                                    dispatch(&tool_calls[idx]);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    tool_calls.retain(|tc| !tc.id.is_empty() && !tc.function.name.is_empty());

    let stream_ms = stream_start.elapsed().as_millis() as u64;
    let result_type = if tool_calls.is_empty() { "text" } else { "tool_calls" };
    tracing::info!(
        session_id,
        first_token_ms = first_token_ms.unwrap_or(0),
        stream_ms,
        chunk_count,
        parts = part_index,
        text_len = full_text.len(),
        tool_count = tool_calls.len(),
        result_type,
        "LLM stream complete"
    );

    if !tool_calls.is_empty() {
        if finish_reason.as_deref() != Some("tool_calls") {
            tracing::warn!(session_id, finish_reason = ?finish_reason, "Tool calls present but finish_reason is not 'tool_calls'");
        }
        for tc in &mut tool_calls {
            if tc.function.arguments.is_empty() {
                tc.function.arguments = "{}".to_string();
            }
        }
        let valid = tool_calls.iter().all(|tc| {
            serde_json::from_str::<serde_json::Value>(&tc.function.arguments).is_ok()
        });
        if valid {
            Ok(LLMResult::ToolCalls(full_text, tool_calls, usage))
        } else {
            tracing::warn!(session_id, "Malformed tool call arguments, falling back to text");
            Ok(LLMResult::TextComplete(full_text, usage))
        }
    } else {
        Ok(LLMResult::TextComplete(full_text, usage))
    }
}

fn error_message(code: u16) -> String {
    match code {
        429 => "Rate limited by the AI provider. Try again in a moment.".to_string(),
        401 | 403 => "AI service configuration error. Contact admin.".to_string(),
        c if c >= 500 => "AI service temporarily unavailable. Try again shortly.".to_string(),
        _ => format!("AI request failed (status {code})."),
    }
}
