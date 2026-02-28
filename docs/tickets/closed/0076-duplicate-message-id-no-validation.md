# No Duplicate Message ID Validation

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The `/chat` endpoint accepts an optional `user_message_id` parameter that's used as the message ID in SpacetimeDB. If a client sends the same `user_message_id` twice (network retry, double-click, race condition), the behavior depends on SpacetimeDB's reducer:
1. If the reducer enforces unique primary keys, the second insert fails but the error is silently logged
2. If it doesn't enforce uniqueness, a duplicate message is created

The server doesn't check if the `user_message_id` already exists before calling `send_message`.

Additionally, the optimistic update flow in the frontend sends a UUID, but if the browser retries a failed fetch (or the user double-clicks send), the same UUID could be sent twice.

## Expected Behavior

1. Before creating a message with `user_message_id`, check if it already exists in the subscription cache
2. If it exists, return the existing message_id (idempotent behavior) instead of creating a duplicate
3. This also makes the endpoint safe for retries without creating duplicate messages

## Implementation Notes

In `apps/server/src/main.rs`, before calling `send_message`:

```rust
if let Some(existing) = state.conn.db.message().id().find(&user_msg_id) {
    return Ok(Json(ChatResponse {
        message_id: existing.id.clone(),
        session_id: existing.session_id.clone(),
    }));
}
```

This makes the endpoint idempotent: same input always produces same output.

## Resolution

Added idempotency check in chat_handler before creating the message. If user_message_id already exists in the SpacetimeDB subscription cache, returns 200 with the existing message_id and session_id. This makes the endpoint safe for retries and double-clicks.
