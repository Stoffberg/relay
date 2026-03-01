use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::Arc;

use crate::module_bindings::DbConnection;

pub struct AppState {
    pub openrouter_key: String,
    pub openrouter_model: String,
    pub exploration_model: Option<String>,
    pub fallback_model: Option<String>,
    pub api_key: String,
    pub service_key: Option<String>,
    pub http: reqwest::Client,
    pub conn: DbConnection,
    pub active_sessions:
        std::sync::Mutex<HashMap<String, tokio::sync::mpsc::Sender<QueuedMessage>>>,
    pub cancel_tokens: std::sync::Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub global_request_count: AtomicU64,
    pub global_window_start: AtomicU64,
    pub llm_temperature: f32,
    pub llm_max_tokens: u32,
    pub db_connected: Arc<AtomicBool>,
    pub started_at: std::time::Instant,
    pub agent_heartbeat_observed: Arc<std::sync::Mutex<HashMap<String, std::time::Instant>>>,
    pub _subscription_handle: crate::module_bindings::SubscriptionHandle,
    pub _ws_thread: std::thread::JoinHandle<()>,
}

pub struct QueuedMessage {
    pub id: String,
    pub content: String,
    pub owner_token: String,
    pub model: Option<String>,
}

#[derive(Deserialize)]
pub struct ChatRequest {
    pub message: String,
    pub session_id: String,
    pub user_message_id: Option<String>,
    pub owner_token: String,
    pub model: Option<String>,
}

#[derive(Serialize)]
pub struct ChatResponse {
    pub message_id: String,
    pub session_id: String,
}

#[derive(Deserialize)]
pub struct StopRequest {
    pub session_id: String,
}

#[derive(Deserialize)]
pub struct RegenerateRequest {
    pub session_id: String,
    pub message_id: String,
}

#[derive(Deserialize)]
pub struct EditRequest {
    pub session_id: String,
    pub message_id: String,
    pub content: String,
}

#[derive(Serialize, Clone)]
pub struct LLMRequest {
    pub model: String,
    pub messages: Vec<LLMMessage>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolDefinition>>,
    pub temperature: f32,
    pub max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<ProviderPreferences>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProviderPreferences {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ignore: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_fallbacks: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub require_parameters: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LLMMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: ToolCallFunction,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct ToolDefinition {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: FunctionDefinition,
}

#[derive(Serialize, Clone, Debug)]
pub struct FunctionDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Deserialize)]
pub struct SSEChunk {
    pub choices: Vec<SSEChoice>,
    pub usage: Option<SSEUsage>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct SSEUsage {
    pub prompt_tokens: Option<u64>,
    pub completion_tokens: Option<u64>,
}

#[derive(Deserialize)]
pub struct SSEChoice {
    pub delta: Option<SSEDelta>,
    pub finish_reason: Option<String>,
}

#[derive(Deserialize)]
pub struct SSEDelta {
    pub content: Option<String>,
    pub tool_calls: Option<Vec<SSEToolCall>>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct SSEToolCall {
    pub index: Option<usize>,
    pub id: Option<String>,
    pub function: Option<SSEToolCallFunction>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct SSEToolCallFunction {
    pub name: Option<String>,
    pub arguments: Option<String>,
}

pub struct TokenUsage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
}

pub enum LLMResult {
    TextComplete(String, Option<TokenUsage>),
    ToolCalls(String, Vec<ToolCall>, Option<TokenUsage>),
    Error(String),
}
