# shell_exec Does Not Kill Child Process on Timeout

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

When `shell_exec` times out (after the configured timeout), the `tokio::time::timeout` wrapper drops the future but does not explicitly kill the underlying OS process. The child process spawned via `Command::new("sh").arg("-c").arg(command)` can continue running in the background, consuming resources and potentially modifying the filesystem after the timeout has been reported.

In `apps/agent/src/tools/shell_exec.rs`, the timeout wraps `cmd.output()` which blocks on the child. When the timeout fires:
1. The Rust future is dropped
2. But the OS process is not sent SIGKILL or SIGTERM
3. The process continues running until it finishes naturally

This is especially problematic for long-running commands like `npm install`, `cargo build`, or infinite loops.

## Expected Behavior

Use `Command::spawn()` instead of `Command::output()`, store the child handle, and explicitly `child.kill()` on timeout:

```rust
let mut child = cmd.spawn()?;
match tokio::time::timeout(duration, child.wait_with_output()).await {
    Ok(result) => { /* handle result */ },
    Err(_) => {
        child.kill()?;
        child.wait()?; // reap the zombie
        return Err(anyhow!("Command timed out"));
    }
}
```

## Resolution

Added `kill_on_drop(true)` to the tokio Command. When the timeout fires and the future is dropped, the child process is automatically killed. Prevents orphaned processes from lingering after timeout.

