# Reducer Calls Use Fire-and-Forget Instead of Completion Callbacks

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

The SpacetimeDB SDK provides two variants for every reducer call: a synchronous fire-and-forget version and a `*_then` variant that accepts a completion callback. The server exclusively uses the fire-and-forget version, which means:

1. No confirmation that a reducer actually executed successfully on the database
2. No guaranteed ordering between sequential reducer calls
3. The tool command polling loop (`dispatch_tool_call`) uses a 500ms sleep followed by full table scans instead of using the `create_tool_command_then` callback to get the created ID

Affected locations across `apps/server/src/main.rs`:
- `send_message()` calls (lines ~532-552)
- `append_message_part()` calls during streaming (lines ~1156-1162)
- `create_tool_command()` in dispatch (lines ~1238-1248)
- `update_session_status()` calls (lines ~546, 604)
- `complete_message()` / `fail_message()` calls

## Expected Behavior

Use `*_then` callbacks for critical state transitions:

```rust
state.conn.reducers.create_tool_command_then(
    message_id, session_id, agent_id, tool_name, tool_args, "pending",
    |_ctx, result| {
        match result {
            Ok(()) => { /* command created, proceed */ },
            Err(e) => { /* handle failure */ },
        }
    }
);
```

At minimum, use `_then` callbacks for `create_tool_command` (to get the created ID without polling) and `complete_message` / `fail_message` (to confirm state transitions).

## Implementation Notes

The `_then` variants are already generated in the module bindings (e.g., `send_message_reducer.rs` line 65). The server just needs to switch from the fire-and-forget call to the callback version.

This would eliminate the 500ms sleep + polling anti-pattern in `dispatch_tool_call` and fix the race condition where the cache hasn't updated by the time the code tries to find the created command.

## Resolution

Replaced the most critical fire-and-forget pattern: `dispatch_tool_call` now uses SDK callbacks instead of polling. Tool command creation uses `on_insert` callback with a oneshot channel to get the command ID reactively (replaces 500ms sleep + table scan). Tool result waiting uses `on_insert` on tool_result table with a oneshot channel (replaces 250ms polling loop). Callbacks are cleaned up via `remove_on_insert` after completion or timeout. Other reducer calls (append_message_part, complete_message, etc.) remain fire-and-forget since they are non-blocking status updates where confirmation isn't critical.
