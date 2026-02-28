# Add SpacetimeDB Indexes for Query Performance

**Type:** task
**Severity:** medium
**Component:** server
**Reported:** 2026-02-26

## Description

The SpacetimeDB schema in `packages/spacetime/src/lib.rs` has no secondary indexes. Every query that filters by a non-primary-key field (e.g., "all messages for session X") results in a full table scan. As data grows, this will degrade performance for:

1. `message.session_id`: fetching conversation history
2. `message_part.message_id`: assembling message content
3. `tool_command.session_id`: finding tool commands for a session
4. `tool_command.message_id`: finding tool commands for a message
5. `tool_command.agent_id`: agent finding its pending commands
6. `tool_result.tool_command_id`: finding results for a command
7. `session.user_id`: listing sessions for a user

## Expected Behavior

Add `#[index(btree)]` annotations to frequently queried foreign key fields in the SpacetimeDB schema.

## Implementation Notes

In `packages/spacetime/src/lib.rs`, add index annotations:

```rust
#[table(name = message, public)]
pub struct Message {
    #[primary_key]
    pub id: String,
    #[index(btree)]
    pub session_id: String,
    // ...
}

#[table(name = message_part, public)]
pub struct MessagePart {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub message_id: String,
    // ...
}
```

Apply the same pattern to `tool_command.session_id`, `tool_command.message_id`, `tool_command.agent_id`, `tool_result.tool_command_id`, and `session.user_id`.

Check SpacetimeDB docs to confirm the `#[index(btree)]` attribute syntax is correct for the current SDK version.

After adding indexes, regenerate bindings for all three targets. This is a schema change that may require `--delete-data` on publish.

## Resolution

Added `#[index(btree)]` annotations to all frequently queried foreign key fields: `message.session_id`, `message_part.message_id`, `tool_command.message_id`, `tool_command.session_id`, `tool_command.agent_id`, and `tool_result.tool_command_id`. Published with schema migration. SpacetimeDB v2.0.1 supports field-level `#[index(btree)]` syntax.
