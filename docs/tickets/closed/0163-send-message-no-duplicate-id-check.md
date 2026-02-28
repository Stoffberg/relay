# send_message Reducer Has No Duplicate Message ID Check

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The `send_message` reducer in SpacetimeDB inserts a new message without checking if the `message_id` already exists. If the same ID is used twice (from a retry, race condition, or bug), the behavior depends on SpacetimeDB's insert semantics for primary keys.

In `packages/spacetime/src/lib.rs` around line 145:

```rust
ctx.db.message().insert(Message {
    id: message_id,
    // ...
});
```

No existence check before insert. If SpacetimeDB silently overwrites on duplicate primary key, the original message's metadata (status, role, timestamps) is lost. If it errors, the error propagates to the caller but the reducer provides no clear message about the duplicate.

Note: The HTTP `chat_handler` on the server side *does* check for duplicates (around line 499), but that check is at the HTTP layer, not the database layer. A direct SpacetimeDB client could bypass this check.

## Expected Behavior

Add an existence check in the reducer:

```rust
if ctx.db.message().id().find(&message_id).is_some() {
    return Err(format!("Message {} already exists", message_id));
}
```

## Resolution

Added duplicate message ID check at the reducer level: `send_message` now calls `ctx.db.message().id().find(&message_id)` before inserting and returns an error if the ID already exists. This complements the existing HTTP layer check in `chat_handler` and prevents direct SpacetimeDB clients from creating duplicates.

