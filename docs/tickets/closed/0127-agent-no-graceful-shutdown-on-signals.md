# Agent Has No Signal Handler for Graceful Shutdown

**Type:** bug
**Severity:** high
**Component:** agent
**Reported:** 2026-02-27

## Description

The agent binary installs no signal handlers for SIGTERM or SIGINT. When `relay stop` sends SIGTERM (or user presses Ctrl+C), the process terminates immediately without:
1. Calling `agent_disconnect()` reducer (server thinks agent is still online)
2. Cancelling in-flight tool executions (commands stuck as "executing" forever)
3. Cleaning up the processing set or heartbeat task

The `agent_disconnect` call at line 414-417 in `main.rs` only runs if the command loop exits normally, which never happens on signal termination.

`relay stop` escalates to SIGKILL after 2 seconds, which is even more abrupt.

## Expected Behavior

Install a signal handler that:
1. Sets a shutdown flag to stop accepting new commands
2. Waits briefly for in-flight tools to complete (with a timeout)
3. Calls `agent_disconnect()` to notify the server
4. Then exits cleanly

## Implementation Notes

Use `tokio::signal::ctrl_c()` and/or `tokio::signal::unix::signal(SignalKind::terminate())`:

```rust
tokio::select! {
    _ = run_command_loop(&state, rx) => {},
    _ = tokio::signal::ctrl_c() => {
        info!("Received shutdown signal, disconnecting...");
    },
}
let _ = state.conn.reducers.agent_disconnect(state.agent_id.clone());
```

This also means `relay stop` can give a longer grace period before SIGKILL since the agent will cooperate with SIGTERM.

## Resolution

Wrapped the command loop in `tokio::select!` with `tokio::signal::ctrl_c()`. On SIGINT/Ctrl+C, the agent calls `agent_disconnect` before exiting so the server knows the agent is offline.

