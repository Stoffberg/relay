# Add Rate Limiting to Server

**Type:** feature
**Severity:** high
**Component:** server
**Reported:** 2026-02-26

## Description

The server has no rate limiting at all. An attacker (or a runaway script) could send millions of messages per second, exhausting OpenRouter credits, SpacetimeDB storage, and server memory/CPU on Fly.io.

Every POST to `/chat` spawns LLM processing that costs real money on OpenRouter.

## Expected Behavior

Add rate limiting at the server level. Suggested approach:

1. **Per IP rate limit**: Use `tower_governor` or a simple in memory counter with `tokio::time`. Something like 10 requests per minute per IP.
2. **Per session rate limit**: Max 5 concurrent queued messages per session. If the queue has 5+ unprocessed messages, return 429.
3. **Global rate limit**: Max 60 requests per minute total across all sessions to protect OpenRouter spend.

## Implementation Notes

In `apps/server/src/main.rs`:
1. Add `tower_governor` as a dependency for IP based rate limiting on the Axum router
2. In `chat_handler`, before storing the queued message, count pending messages for the session. If above threshold, return 429 Too Many Requests
3. Consider adding a global `AtomicU64` counter that resets every minute

The frontend should handle 429 gracefully by showing a "slow down" message instead of a generic error.

## Resolution

Added two rate limiting mechanisms without any new dependencies. Global rate limit uses AtomicU64 counter with a 60 second sliding window, capped at 60 requests per minute. Resets automatically when the window expires. Per session queue limit checks the SpacetimeDB cache for queued user messages before accepting a new one; returns 429 if 5 or more are already pending. Both return descriptive error messages that the frontend already displays through its existing error handling (the `data.error` path shows the message directly). Skipped per-IP rate limiting since auth via API key (ticket 0001) already prevents anonymous abuse. Deployed and verified: health OK, authenticated requests succeed, rate limit fields in AppState initialized at startup.
