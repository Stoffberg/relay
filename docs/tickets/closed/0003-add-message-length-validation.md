# Add Message Length Validation

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-26

## Description

The `ChatRequest` struct in the server accepts `message: String` with no length validation (line 39 of `main.rs`). A client could send a multi gigabyte message body, exhausting server memory. The `session_id` field is similarly unbounded.

Additionally, the session title truncation at line 404 uses `.get(..77)` which could panic on a multi byte UTF-8 character boundary. Should use `.chars().take(77).collect::<String>()` instead.

## Steps to Reproduce

1. Send a POST to `/chat` with a 1GB message body
2. Server attempts to deserialize the entire string into memory
3. Memory exhaustion or OOM kill on Fly.io

## Expected Behavior

1. Reject messages longer than a reasonable limit (e.g., 100KB) with a 413 Payload Too Large
2. Reject session_id longer than 256 characters with a 400 Bad Request
3. Fix title truncation to be UTF-8 safe

## Implementation Notes

In `apps/server/src/main.rs`:
1. Add Axum `DefaultBodyLimit` to the router (e.g., `DefaultBodyLimit::max(100 * 1024)`)
2. In `chat_handler`, validate `session_id.len() <= 256` before processing
3. Fix line 404: change `.get(..77)` to `.chars().take(77).collect::<String>()`

## Resolution

Added `DefaultBodyLimit::max(100 * 1024)` to the Axum router (requires `limit` feature on tower-http). Added session_id length validation in chat_handler that returns 400 if over 256 chars. Fixed title truncation to use `.chars().take(77).collect::<String>()` for UTF-8 safety. Deployed to Fly.io and verified: 413 for oversized payloads, 400 for long session_ids, health check passing.
