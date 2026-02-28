# Agent Stop Can Kill Wrong Process on PID Reuse

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

`relay stop` reads a PID from `~/.config/relay/agent.pid` and sends SIGTERM to it. If the agent crashed and the operating system reused that PID for an unrelated process, `relay stop` will kill the wrong process.

In `apps/agent/src/main.rs` around line 199:

```rust
unsafe { libc::kill(pid as i32, libc::SIGTERM) };
```

The `is_process_running()` check at line 197 only verifies that *a* process with that PID exists, not that it's the relay agent.

## Expected Behavior

Store additional identifying information in the PID file (e.g., process start time or a unique token) and verify it before sending signals. Alternatively, check the process name or command line matches "relay" before killing.

## Implementation Notes

On macOS/Linux, you can check `/proc/{pid}/cmdline` (Linux) or use `sysctl` (macOS) to verify the process is actually the relay agent. A simpler approach: write `{pid}\n{start_timestamp}` to the PID file and verify the process's start time matches before killing.

On macOS specifically:

```rust
fn is_relay_process(pid: u32) -> bool {
    let output = std::process::Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "comm="])
        .output()
        .ok();
    output.map(|o| String::from_utf8_lossy(&o.stdout).contains("relay")).unwrap_or(false)
}
```

## Resolution

Added `is_relay_process(pid)` that shells out to `ps -p <pid> -o comm=` and verifies the process name ends with `relay-agent` or `relay`. All three commands that check the PID (`cmd_start`, `cmd_stop`, `cmd_status`) now require both `is_process_running()` AND `is_relay_process()` before treating the PID as valid. If the PID exists but isn't a relay process, the stale PID file is cleaned up instead of killing the wrong process.

