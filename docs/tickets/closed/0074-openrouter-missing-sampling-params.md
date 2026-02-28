# OpenRouter Request Missing Temperature and Max Tokens

**Type:** task
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The `LLMRequest` struct sent to OpenRouter only includes `model`, `messages`, `stream`, and `tools`. No sampling parameters are set:
1. `temperature`: Controls randomness (default varies by model; Claude defaults to 1.0)
2. `max_tokens`: Controls response length (without this, the model uses its own default which can vary)
3. `top_p`: Alternative to temperature for controlling randomness

This means the AI's behavior depends entirely on OpenRouter and the model's defaults, which can change without notice.

## Expected Behavior

Set explicit sampling parameters:

```rust
struct LLMRequest {
    model: String,
    messages: Vec<LLMMessage>,
    stream: bool,
    tools: Option<Vec<ToolDefinition>>,
    temperature: f32,       // e.g., 0.7 for balanced responses
    max_tokens: u32,        // e.g., 4096 for reasonable response length
}
```

Make these configurable via environment variables so they can be adjusted without redeployment.

## Implementation Notes

In `apps/server/src/main.rs`:

1. Add fields to `LLMRequest` (or `LLMRequestBody`)
2. Add env vars: `OPENROUTER_TEMPERATURE` (default 0.7), `OPENROUTER_MAX_TOKENS` (default 4096)
3. Store in AppState and include in every request
4. For the per-session model selection feature (ticket 0023), these could also be per-session

Setting `max_tokens` is especially important because without it, some models will generate very long responses that burn through tokens and take a long time to stream.

## Resolution

Added temperature (f32) and max_tokens (u32) fields to LLMRequest. Configurable via OPENROUTER_TEMPERATURE (default 0.7) and OPENROUTER_MAX_TOKENS (default 4096) environment variables. Stored in AppState and included in every OpenRouter request. Server deployed.
