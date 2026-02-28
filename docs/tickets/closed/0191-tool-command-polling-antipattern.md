# Tool Command Dispatch Uses Sleep-and-Poll Instead of SDK Callbacks

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

The `dispatch_tool_call` function in the server creates a tool command via reducer, then sleeps for 500ms and polls the entire `tool_command` table to find the newly created row. This is an anti-pattern: the SpacetimeDB SDK provides `create_tool_command_then` callbacks that fire when the reducer completes, giving the created row's ID directly.

In `apps/server/src/main.rs` around lines 1230-1262:

```rust
// Get max ID before creation
let pre_max_id = state.conn.db.tool_command().iter()
    .map(|c| c.id).max().unwrap_or(0);

// Create command
state.conn.reducers.create_tool_command(...)?;

// Sleep and hope cache updated
tokio::time::sleep(Duration::from_millis(500)).await;

// Scan entire table to find new command
let cmd_id = state.conn.db.tool_command().iter()
    .filter(|c| c.id > pre_max_id && c.message_id == message_id ...)
    .map(|c| c.id).max();
```

This pattern:
1. Scans the entire table twice (once for max, once to find)
2. Relies on a 500ms sleep being "enough" for the subscription to update
3. Can fail if the subscription update takes longer than 500ms
4. Gets worse as the table grows

Then for waiting on the result, it polls every 250ms for up to 120 seconds:

```rust
loop {
    tokio::time::sleep(Duration::from_millis(250)).await;
    let maybe_cmd = state.conn.db.tool_command().iter()
        .find(|c| c.id == cmd_id && ...);
}
```

## Expected Behavior

Use the SDK's callback-based approach:

1. For creation: Use `create_tool_command_then` to get the created ID without polling
2. For waiting on result: Use `on_update` callback on the `tool_command` table filtered by the specific command ID, with a `tokio::sync::oneshot` channel to signal completion

```rust
let (tx, rx) = tokio::sync::oneshot::channel();
state.conn.db.tool_command().on_update(move |_ctx, _old, new| {
    if new.id == cmd_id && (new.status == "completed" || new.status == "error") {
        let _ = tx.send(new.clone());
    }
});
tokio::time::timeout(Duration::from_secs(120), rx).await
```

This eliminates all polling and table scans, reacting to changes in real time via the subscription system.

## Resolution

Eliminated all polling in `dispatch_tool_call`. Phase 1 (command creation): registers `tool_command().on_insert()` callback before calling `create_tool_command`, sends cmd_id through `tokio::sync::oneshot` channel with 10s timeout. Phase 2 (result waiting): registers `tool_result().on_insert()` callback filtered by cmd_id, sends result through oneshot channel with 120s timeout. Both callbacks are removed via `remove_on_insert` on completion or timeout. No more table scans, no more sleep-and-poll loops.
