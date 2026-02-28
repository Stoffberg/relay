# Reducers Allow Orphaned Records in SpacetimeDB

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

Several SpacetimeDB reducers create child records without verifying the parent exists. This allows orphaned data that wastes storage and can cause confusing behavior when querying.

Affected reducers in `packages/spacetime/src/lib.rs`:

1. `append_message_part` (line ~194): No check that `message_id` exists in the `message` table. Parts can be created for deleted or never-existing messages.

2. `create_tool_command` (line ~206): No check that `message_id`, `session_id`, or `agent_id` exist. Tool commands can reference deleted sessions or non-existent agents.

3. `create_tool_result` (line ~250): No check that `tool_command_id` exists. Results can be created for non-existent commands.

## Expected Behavior

Each reducer should verify parent entities exist before creating child records:

```rust
#[spacetimedb::reducer]
pub fn append_message_part(ctx: &ReducerContext, message_id: String, ...) -> Result<(), String> {
    if ctx.db.message().id().find(&message_id).is_none() {
        return Err(format!("Message {} not found", message_id));
    }
    // ... proceed with insert
}
```

## Implementation Notes

SpacetimeDB doesn't support foreign key constraints natively, so these checks must be explicit in the reducer logic. The checks are cheap since they use primary key lookups.

Also worth noting: there's no cascading delete mechanism. When a session is deleted (ticket 0011), orphaned messages, parts, tool commands, and results will remain. The delete implementation should handle cleanup of all child records.

## Resolution

Added parent existence checks to three reducers in `packages/spacetime/src/lib.rs`: `append_message_part` now verifies the message exists before inserting a part, `create_tool_command` verifies both the message and session exist, and `create_tool_result` verifies the tool_command exists. All checks use primary key lookups so they're cheap. Published to SpacetimeDB without data wipe since no schema changes were needed.

