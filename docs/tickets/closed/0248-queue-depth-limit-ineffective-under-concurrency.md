# Per-Session Queue Depth Limit Ineffective Under Concurrent Requests

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The per-session queue depth limit (max 5 queued messages) is checked by scanning messages in the SpacetimeDB cache for the session. Under concurrent requests, multiple requests pass the check simultaneously because the cache hasn't updated with the newly inserted messages yet.

Tested in production: sent 8 concurrent messages to the same session and all 8 were accepted with 200 OK, despite the 5-message limit.

## Steps to Reproduce

1. Send 8+ concurrent POST requests to `/chat` with the same `session_id`
2. All requests return 200 OK
3. All 8 messages are queued in SpacetimeDB

## Expected Behavior

At most 5 messages should be queued per session. Excess messages should be rejected with 429 or 400.

## Implementation Notes

The fundamental issue is that the check-then-insert pattern is not atomic. The SpacetimeDB cache is eventually consistent (updates arrive via subscription, not synchronously after reducer calls).

Options:
1. Move the queue depth check into the SpacetimeDB reducer (`send_message`), which executes atomically. The reducer can count queued messages and reject if over the limit.
2. Use a server-side in-memory counter per session (AtomicU64) that's incremented before the reducer call and decremented when the message is dequeued.
3. Accept the race as low-risk (users rarely send >5 messages simultaneously).

## Resolution

Added `session_queue_counts` HashMap of `Arc<AtomicU64>` to AppState. In `chat_handler`, the counter is incremented atomically BEFORE calling the send_message reducer. If the previous value is >= 5, the increment is rolled back and the request is rejected with 429. The counter is decremented in `run_session_queue` after each message is dequeued. This makes the check atomic regardless of SpacetimeDB cache consistency.
