# Shell Exec Tool Has No Timeout

**Type:** bug
**Severity:** high
**Component:** agent
**Reported:** 2026-02-26

## Description

In `apps/agent/src/tools/shell_exec.rs`, the command is executed via `Command::new("sh").arg("-c").arg(&args.command).output()` (line 21). The `.output()` call waits indefinitely for the child process to finish.

If the LLM asks the agent to run a command that hangs (e.g., `cat /dev/urandom`, `sleep infinity`, or a server process that never exits), the agent blocks forever on that tool command. No other tool commands can be processed because the async runtime is blocked on the synchronous `.output()` call.

Additionally, there's no limit on output size. A command like `yes` or `cat /dev/zero` would fill memory until the process is killed.

## Expected Behavior

1. Commands should have a configurable timeout (default 120 seconds to match server's tool wait timeout)
2. Output should be capped at a reasonable size (e.g., 1MB)
3. If timeout is reached, kill the child process and return an error

## Implementation Notes

In `apps/agent/src/tools/shell_exec.rs`:
1. Use `tokio::process::Command` instead of `std::process::Command` to get async execution
2. Use `tokio::time::timeout(Duration::from_secs(120), child.wait_with_output())` to enforce a deadline
3. On timeout, call `child.kill()` before returning error
4. After collecting output, truncate stdout/stderr to 1MB with a `[truncated]` marker

Alternatively, use the `spawn()` + `wait_with_output()` pattern with a `select!` on a timer.

## Resolution

Rewrote `shell_exec.rs` to use `tokio::process::Command` instead of `std::process::Command`. Added 120 second timeout via `tokio::time::timeout` that returns an error if exceeded. Output (stdout and stderr) is capped at 1MB with a `[output truncated at 1MB]` marker. Agent binary rebuilt and installed.
