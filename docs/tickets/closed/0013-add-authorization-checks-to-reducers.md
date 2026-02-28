# Add Authorization Checks to SpacetimeDB Reducers

**Type:** feature
**Severity:** high
**Component:** server
**Reported:** 2026-02-26

## Description

None of the SpacetimeDB reducers in `packages/spacetime/src/lib.rs` validate that the caller owns the resource they're modifying. Any SpacetimeDB client can:

1. Update any session's status or title
2. Complete or fail any message
3. Append parts to any message
4. Create tool commands in any session
5. Update any tool command's status
6. Create tool results for any tool command
7. Register, heartbeat, or disconnect any agent

Since all tables are marked `public`, every field is readable by all connected clients too. This means sensitive data (file contents in tool results, shell command outputs) is visible to anyone who connects to the SpacetimeDB instance.

## Expected Behavior

Each reducer that modifies a resource should validate `ctx.sender()` matches the `user_id` of the owning session/message/agent:

1. `update_session_status`: verify `ctx.sender() == session.user_id`
2. `update_session_title`: verify `ctx.sender() == session.user_id`
3. `send_message`: verify `ctx.sender() == session.user_id` (look up session by session_id)
4. `complete_message`, `fail_message`: verify `ctx.sender() == message.user_id`
5. `append_message_part`: verify `ctx.sender() == message.user_id`
6. `create_tool_command`: verify `ctx.sender() == session.user_id`
7. `update_tool_command_status`: verify ownership chain
8. `create_tool_result`: verify the agent owns the tool command
9. `agent_heartbeat`, `agent_disconnect`: verify `ctx.sender() == agent.user_id`

## Implementation Notes

In each reducer, add a check like:

```rust
let session = ctx.db.session().id().find(&session_id)
    .ok_or_else(|| "Session not found".to_string())?;
if session.user_id != ctx.sender {
    return Err("Unauthorized".to_string());
}
```

For the server (which calls reducers for message processing), its SpacetimeDB identity will be the "owner" of messages it creates. Make sure the server identity has the right permissions, or use a service identity pattern.

## Resolution

Added `ctx.sender()` ownership validation to all reducers that modify resources. Helper functions `check_session_owner` and `check_agent_owner` verify the caller's identity matches the resource owner. Affected reducers: `update_session_status`, `update_session_title`, `send_message`, `complete_message`, `fail_message`, `append_message_part`, `create_tool_command`, `update_tool_command_status`, `register_agent`, `agent_heartbeat`, `agent_disconnect`. All return 'Unauthorized' if the caller doesn't own the resource.
