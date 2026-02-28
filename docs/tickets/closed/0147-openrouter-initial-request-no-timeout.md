# OpenRouter Initial HTTP Request Has No Timeout

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The HTTP request to OpenRouter at `https://openrouter.ai/api/v1/chat/completions` has no connection or response timeout configured. While the streaming phase has a 15-second per-chunk timeout, the initial connection and response phase (`reqwest::Client::post().send().await`) can hang indefinitely if OpenRouter is slow to respond or the DNS resolution stalls.

In `apps/server/src/main.rs` around line 1034-1040:

```rust
let response = state
    .http
    .post("https://openrouter.ai/api/v1/chat/completions")
    .header("Authorization", format!("Bearer {}", state.openrouter_key))
    .json(&body)
    .send()
    .await?;
```

The `state.http` client is created with `reqwest::Client::new()` which uses a default 30-second timeout for connect but no overall timeout.

If OpenRouter accepts the connection but takes 5 minutes to return the first byte, the session is stuck in "streaming" status for that entire duration, and the user's session queue is blocked.

## Expected Behavior

Set an explicit timeout on the request:

```rust
let response = state.http
    .post(url)
    .timeout(Duration::from_secs(30))
    .header(...)
    .json(&body)
    .send()
    .await?;
```

Or configure the client-level timeout at construction time.

## Resolution

Added .timeout(Duration::from_secs(30)) to the OpenRouter HTTP request. If the initial connection or first byte takes longer than 30 seconds, the request fails and can be retried. Server deployed.

