# No User-Agent Header on OpenRouter API Requests

**Type:** task
**Severity:** low
**Component:** server
**Reported:** 2026-02-27

## Description

HTTP requests to OpenRouter's API at `https://openrouter.ai/api/v1/chat/completions` only include the Authorization header. The `User-Agent` header defaults to whatever reqwest sets (typically `reqwest/0.x`), which doesn't identify the application.

OpenRouter recommends setting `HTTP-Referer` and `X-Title` headers for app identification and leaderboard tracking. Without these, the app doesn't get attributed in OpenRouter's analytics and may receive lower priority during rate limiting.

## Expected Behavior

Add identifying headers per OpenRouter docs:

```rust
.header("HTTP-Referer", "https://code.stoff.dev")
.header("X-Title", "Relay")
.header("User-Agent", "relay-server/1.0")
```

## Implementation Notes

One-line additions to the request builder. No dependencies needed. This also helps OpenRouter's support team identify requests if there's ever a billing or rate limit issue.

## Resolution

Added HTTP-Referer (https://code.stoff.dev) and X-Title (Relay) headers to OpenRouter requests per their API docs. This enables app attribution in OpenRouter analytics. Server deployed.

