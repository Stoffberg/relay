# Add Model Fallback When Primary Model Is Unavailable

**Type:** feature
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

If the configured OpenRouter model (e.g., `anthropic/claude-3.5-sonnet`) is temporarily unavailable or rate limited, all messages fail. There's no fallback to a secondary model.

OpenRouter has many models available, and falling back to an alternative (e.g., `anthropic/claude-3-haiku` or `google/gemini-pro`) would keep the service functional during outages.

## Expected Behavior

1. Add a `OPENROUTER_FALLBACK_MODEL` env var
2. If the primary model returns a 503 or model-specific error, automatically retry with the fallback model
3. Include a note in the response that a fallback model was used

## Implementation Notes

In `apps/server/src/main.rs`, in `stream_llm_response`:

```rust
let models = [&state.openrouter_model, &state.fallback_model];
for model in models {
    let result = try_stream(model, messages, tools).await;
    match result {
        Ok(r) => return Ok(r),
        Err(e) if is_model_unavailable(&e) => continue,
        Err(e) => return Err(e),
    }
}
```

When falling back, prepend a system note: "[Using fallback model due to primary model unavailability]" so the user knows.

## Resolution

Added `OPENROUTER_FALLBACK_MODEL` env var support. Extracted `send_llm_request` helper that handles both primary and fallback model attempts. On 429 (rate limit) or 5xx errors from the primary model, automatically retries with the fallback. Set to `anthropic/claude-3-haiku` on Fly.io. The fallback is optional; server works fine without it configured.
