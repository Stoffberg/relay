# OpenRouter Error Messages Leak Internal Details to User

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-26

## Description

When OpenRouter returns a non-200 status (rate limit, auth failure, model unavailable, etc.), the server passes the raw error response body to the user via `fail_message`. This is at line 884 of `apps/server/src/main.rs`:

```rust
return Ok(LLMResult::Error(format!("OpenRouter returned {status}: {text}")));
```

This can expose:
1. The OpenRouter API endpoint URL
2. Rate limit details and quota information
3. Model availability information
4. Potentially the API key format in error messages
5. Internal error codes that mean nothing to the user

## Expected Behavior

Map OpenRouter errors to user friendly messages:
1. 429 (rate limit): "I'm a bit busy right now. Try again in a moment."
2. 401/403 (auth): "There's a configuration issue. Please contact the admin."
3. 500+ (server error): "The AI service is temporarily unavailable. Try again shortly."
4. Model specific errors: "This model is currently unavailable."

Log the full error details server side for debugging, but show the user a sanitized message.

## Implementation Notes

In `apps/server/src/main.rs` around line 884, replace the raw error forwarding with a match on the status code:

```rust
let user_message = match status.as_u16() {
    429 => "Rate limited. Try again in a moment.".to_string(),
    401 | 403 => "Configuration error. Contact admin.".to_string(),
    s if s >= 500 => "AI service temporarily unavailable.".to_string(),
    _ => format!("Request failed (status {status})."),
};
tracing::error!("OpenRouter error {status}: {text}");
return Ok(LLMResult::Error(user_message));
```

## Resolution

Replaced raw OpenRouter error forwarding with sanitized messages. 429 returns 'Rate limited by the AI provider. Try again in a moment.' 401/403 returns 'AI service configuration error. Contact admin.' 500+ returns 'AI service temporarily unavailable. Try again shortly.' Other codes return a generic message with just the status code. Full error details are logged server-side via tracing::error.
