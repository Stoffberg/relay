# Agent Abandons In-Flight Tool Commands on Shutdown

**Type:** bug
**Severity:** high
**Component:** agent
**Reported:** 2026-02-27

## Description

When the agent shuts down (Ctrl+C or SIGTERM), `tokio::select!` cancels the `run_command_loop` future, which drops the channel receiver. However, any tool execution tasks already spawned via `tokio::spawn` continue running until the tokio runtime shuts down. If a shell command is mid-execution, it gets killed (via `kill_on_drop(true)`), and the result is never written back to SpacetimeDB.

The `tool_command` row stays in "executing" status permanently. The server is polling for a `tool_result` with a 120-second timeout, so it will eventually time out, but the session is stuck waiting that entire duration unnecessarily.

## Expected Behavior

On shutdown, the agent should:
1. Stop accepting new commands
2. Wait briefly (e.g., 5 seconds) for in-flight commands to finish
3. For any commands still running, write an error result back to SpacetimeDB ("Agent shutting down")
4. Then disconnect

## Implementation Notes

Use a `CancellationToken` or `JoinSet` to track spawned tasks. On shutdown signal, stop the command loop, then `join` or cancel remaining tasks with a timeout. For any that don't finish, call `create_tool_result` with `success: false` and `error: "Agent shut down while executing"`.

## Resolution

Changed `run_command_loop` to track spawned task `JoinHandle`s in a Vec (pruned of finished handles on each new command). On exit (either disconnect or ctrl+c), the function returns the inflight handles. The caller waits up to 5 seconds for them to complete. Tasks that finish in time write their results to SpacetimeDB normally. The 5s timeout prevents indefinite hangs on long-running shell commands.
