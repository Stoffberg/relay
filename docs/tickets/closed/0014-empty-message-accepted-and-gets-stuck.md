# Empty Message Accepted and Gets Stuck as Queued

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-26

## Description

Sending an empty string message to `/chat` is accepted with 200 OK and the message is stored in SpacetimeDB with status "queued". However, the message is never processed: it stays "queued" forever while the session goes back to "idle".

Verified against the live environment at `code-api.stoff.dev`.

## Steps to Reproduce

```bash
curl -s -X POST https://code-api.stoff.dev/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "", "session_id": "test-empty-msg"}'
```

Returns 200 with a message_id. But querying SpacetimeDB shows:
1. Message stays "queued" forever
2. Session status is "idle"
3. No assistant response is ever generated

## Expected Behavior

Two fixes needed:

1. **Reject empty messages**: In `chat_handler`, validate that `message.trim()` is not empty. Return 400 Bad Request if it is.
2. **Process or skip empty queued messages**: If an empty message somehow gets queued, `run_session_queue` should either skip it or process it normally rather than leaving the session in a broken state where queued messages exist but the session is idle.

## Implementation Notes

In `apps/server/src/main.rs` `chat_handler`:

```rust
if request.message.trim().is_empty() {
    return (StatusCode::BAD_REQUEST, "Message cannot be empty").into_response();
}
```

Also investigate why the queue processor didn't pick up this message. The empty message content might be causing an error in `run_agent_loop` or `fetch_history` that silently drops the message without marking it as "error".

## Resolution

Added validation in chat_handler to reject empty or whitespace-only messages with 400 Bad Request and error message 'Message cannot be empty'. Uses `payload.message.trim().is_empty()` check before any processing. Deployed and verified: both empty strings and whitespace-only messages return 400.
