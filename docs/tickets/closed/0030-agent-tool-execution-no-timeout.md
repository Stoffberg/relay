# Agent Tool Execution Has No Timeout Wrapper

**Type:** bug
**Severity:** high
**Component:** agent
**Reported:** 2026-02-26

## Description

In `apps/agent/src/main.rs` around line 444, `execute_tool()` is called without any timeout wrapper. While ticket 0005 covers `shell_exec` specifically, this is a broader issue: ALL tool executions (file_read, file_write, file_edit, glob, grep, list_dir) have no timeout.

A `glob("**/*")` on a massive filesystem, a `grep` with catastrophic backtracking regex, or a `file_read` on a huge file could all hang the agent indefinitely. While these hang, the agent can't process any other tool commands.

The server has a 120 second timeout waiting for tool results, but the agent itself never kills a stuck tool.

## Expected Behavior

Wrap the `execute_tool()` call in `tokio::time::timeout`:

```rust
match tokio::time::timeout(Duration::from_secs(110), execute_tool(&tool_name, &tool_args)).await {
    Ok(result) => result,
    Err(_) => Err(anyhow!("Tool execution timed out after 110 seconds")),
}
```

Use 110 seconds (slightly less than the server's 120s) so the agent reports the timeout before the server gives up.

## Implementation Notes

In `apps/agent/src/main.rs`, wrap the tool execution call. This is a single line change that protects against all tool types.

For `shell_exec` specifically (ticket 0005), also add process-level killing so the child process doesn't outlive the timeout.

## Resolution

Wrapped the `execute_tool` call in `main.rs` with `tokio::time::timeout` at 110 seconds (just under the server's 120s limit). If any tool (file_read, grep, glob, etc.) hangs, the agent returns "Tool execution timed out after 110 seconds" instead of blocking forever. Agent binary rebuilt and installed.
