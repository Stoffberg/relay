# Agent Executes Tool Commands Concurrently With No Ordering

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

In `run_command_loop`, each incoming tool command is dispatched via `tokio::spawn`, meaning multiple commands execute concurrently with no ordering guarantee. If the server sends two sequential commands for the same session (e.g., `file_write` to create a file, then `file_read` to read it), the agent may execute them in reverse order or simultaneously, causing the read to fail because the file doesn't exist yet.

In `apps/agent/src/main.rs` around line 436:

```rust
tokio::spawn(async move {
    // execute tool...
});
```

The server dispatches tool calls sequentially (one at a time per agent loop iteration), but the agent has no per-session ordering.

## Expected Behavior

For commands within the same session, execute sequentially. Commands from different sessions can still run concurrently. This could be implemented with a per-session task queue or ordered channel.

## Implementation Notes

A simple approach: maintain a `HashMap<session_id, mpsc::Sender>` where each session has its own single-consumer channel. Commands for the same session are sent to the same channel and processed one at a time. New sessions get a new channel and spawned consumer task.

## Resolution

Implemented per-session sequential command execution using `HashMap<String, mpsc::Sender>`. Each session gets its own channel and dedicated consumer task that processes commands one at a time. Commands from different sessions still run concurrently. New sessions spawn a new channel and consumer task on first command. This guarantees ordering for sequential tool calls within the same session (e.g., file_write then file_read).
