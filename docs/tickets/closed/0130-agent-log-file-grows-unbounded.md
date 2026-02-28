# Agent Log File Grows Unbounded

**Type:** task
**Severity:** low
**Component:** agent
**Reported:** 2026-02-27

## Description

The agent logs to `~/.config/relay/agent.log` in append mode with no rotation or size limit. Over time, this file grows unbounded, potentially consuming significant disk space. The `relay logs` command tails this file, and a very large log file can slow down `tail` operations.

In `apps/agent/src/main.rs`, the log file is opened with:

```rust
let log_file = std::fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(log_path())?;
```

## Expected Behavior

Implement basic log rotation: either rotate on startup (rename old log to `agent.log.1`), rotate when file exceeds a size threshold (e.g., 10MB), or truncate on startup. A simple approach is to keep the current log and one rotated backup.

## Implementation Notes

Simplest fix: on `relay start`, if `agent.log` exceeds 10MB, rename it to `agent.log.old` (overwriting any previous backup) before opening the new log. This keeps at most ~20MB of logs.

## Resolution

Added log rotation in `cmd_start`: if `agent.log` exceeds 10MB, it's renamed to `agent.log.old` before opening a new log file. This keeps at most ~20MB of logs on disk.

