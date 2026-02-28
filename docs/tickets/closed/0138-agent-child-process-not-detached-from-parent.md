# Agent Child Process Not Detached From Parent on Start

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

When `relay start` spawns the background agent process, the child inherits the parent's process group. If the user presses Ctrl+C to kill the `relay start` process, the SIGINT is also delivered to the child agent process, terminating it immediately.

In `apps/agent/src/main.rs` around lines 178-183:

```rust
let child = std::process::Command::new(exe)
    .arg("run")
    .stdout(log_file)
    .stderr(log_err)
    .stdin(std::process::Stdio::null())
    .spawn()?;
```

No call to `setsid()` or process group separation.

## Steps to Reproduce

1. Run `relay start`
2. Quickly press Ctrl+C
3. The agent process is also killed
4. `relay status` shows "not running"

## Expected Behavior

The spawned agent process should be fully detached from the parent terminal. On Unix, this means calling `setsid()` or using `pre_exec` to move the child to its own process group.

## Implementation Notes

Use the `pre_exec` hook on the Command builder:

```rust
use std::os::unix::process::CommandExt;

let child = std::process::Command::new(exe)
    .arg("run")
    .stdout(log_file)
    .stderr(log_err)
    .stdin(std::process::Stdio::null())
    .pre_exec(|| {
        unsafe { libc::setsid() };
        Ok(())
    })
    .spawn()?;
```

## Resolution

Added `pre_exec` hook with `libc::setsid()` to the child process spawned by `relay start`. This creates a new session for the child process, detaching it from the parent terminal's process group. Ctrl+C on the terminal after `relay start` no longer kills the background agent.

