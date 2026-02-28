# Add Session Delete Functionality

**Type:** feature
**Severity:** medium
**Component:** server, web
**Reported:** 2026-02-26

## Description

There is no way to delete a session. Sessions accumulate forever in SpacetimeDB with no cleanup mechanism. The schema has no delete reducers for any table, and the frontend has no delete UI.

Related: messages, message_parts, tool_commands, and tool_results for deleted sessions become orphaned data with no cleanup path.

## Expected Behavior

1. User can delete a session from the sidebar (right click menu, swipe, or delete button)
2. Deleting a session removes the session and all associated data (messages, parts, tool commands, tool results)
3. If the session is currently streaming, cancel it first before deleting

## Implementation Notes

### SpacetimeDB Schema (`packages/spacetime/src/lib.rs`)

Add a `delete_session` reducer that:
1. Validates the caller owns the session (`ctx.sender() == session.user_id`)
2. Deletes all `tool_result` rows for tool commands in this session
3. Deletes all `tool_command` rows for this session
4. Deletes all `message_part` rows for messages in this session
5. Deletes all `message` rows for this session
6. Deletes the `session` row

Note: SpacetimeDB doesn't have cascading deletes, so this must be done manually in the reducer. The order matters to avoid foreign key style issues.

### Frontend (`apps/web/`)

1. Add a delete button or context menu item in `sidebar.tsx` for each session
2. Call the `delete_session` reducer via SpacetimeDB SDK
3. If the deleted session is currently active, navigate to a new session or the index page
4. Add confirmation dialog before deletion

### Regenerate Bindings

After adding the reducer, regenerate bindings for all three targets (TypeScript, server Rust, agent Rust).

## Resolution

Added `delete_session` reducer to SpacetimeDB schema that cascade deletes all associated data (tool_results, tool_commands, message_parts, messages, then session). Frontend sidebar context menu now has a "Delete" option (red text, separated by divider). If the deleted session is currently active, the user is navigated to the index page. All bindings regenerated for TypeScript, server Rust, and agent Rust. Deployed to both Fly.io and Cloudflare.
