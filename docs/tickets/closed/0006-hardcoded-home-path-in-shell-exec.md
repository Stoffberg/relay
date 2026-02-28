# Hardcoded Home Path in Shell Exec

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-26

## Description

In `apps/agent/src/tools/shell_exec.rs` line 5, the HOME environment variable fallback is hardcoded to `/Users/dirk.beukes`:

```rust
let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/dirk.beukes".to_string());
```

This breaks on any machine where the username is different, on Linux systems where home is `/home/<user>`, and on any non macOS platform.

## Expected Behavior

Use a proper fallback that works on any system. Options:
1. Use `dirs::home_dir()` from the `dirs` crate
2. Use `std::env::var("HOME")` and return an error if not set (it should always be set in a normal shell environment)
3. Fall back to the working directory from agent config instead of a hardcoded path

## Implementation Notes

In `apps/agent/src/tools/shell_exec.rs` line 5, replace the hardcoded fallback:

```rust
let home = std::env::var("HOME")
    .or_else(|_| std::env::var("USERPROFILE"))  // Windows fallback
    .unwrap_or_else(|_| ".".to_string());
```

Or use `dirs::home_dir()` if the crate is already a dependency.

## Resolution

Replaced the hardcoded `/Users/dirk.beukes` fallback with a portable chain: `HOME` env var → `USERPROFILE` env var (Windows) → `.` (current dir). Works on macOS, Linux, and Windows. Agent binary rebuilt and installed.
