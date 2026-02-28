# Agent Uses Unbounded Channel for Tool Commands

**Type:** task
**Severity:** low
**Component:** agent
**Reported:** 2026-02-27

## Description

The agent uses `mpsc::unbounded_channel()` for tool command dispatch. If tool execution is slow and commands accumulate (e.g., malicious input causing many tool calls), the channel grows without limit, consuming unbounded memory.

In `apps/agent/src/main.rs`, the channel has no capacity limit:

```rust
let (cmd_tx, cmd_rx) = mpsc::unbounded_channel::<ToolCommand>();
```

## Expected Behavior

Use a bounded channel with a reasonable capacity (e.g., 100 commands) to provide backpressure. When the channel is full, new commands are either dropped or the sender blocks until space is available.

## Implementation Notes

Replace with `mpsc::channel::<ToolCommand>(100)`. The `on_insert` and `on_update` handlers would need to use `try_send` instead of `send` and log a warning when the channel is full. This is a low priority since the server dispatches tools sequentially per session, so the realistic queue depth is very small.

## Resolution

Replaced `mpsc::unbounded_channel()` with `mpsc::channel(100)` for bounded backpressure. All senders now use `try_send()` instead of `send()`, logging a warning when the channel is full. The `run_command_loop` function signature was updated to accept `mpsc::Receiver` instead of `mpsc::UnboundedReceiver`.

