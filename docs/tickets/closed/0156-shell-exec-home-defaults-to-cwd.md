# shell_exec Falls Back to Current Directory When HOME Is Unset

**Type:** bug
**Severity:** low
**Component:** agent
**Reported:** 2026-02-27

## Description

In `shell_exec.rs`, when constructing the PATH for the child process, the code reads `$HOME` (or `%USERPROFILE%` on Windows) to find cargo and bun binaries. If neither environment variable is set, it falls back to `"."` (the current working directory).

In `apps/agent/src/tools/shell_exec.rs` around lines 7-9:

```rust
let home = std::env::var("HOME")
    .or_else(|_| std::env::var("USERPROFILE"))
    .unwrap_or_else(|_| ".".to_string());
```

Using `"."` means the PATH includes `"./.cargo/bin"` and `"./.bun/bin"`, which would search for binaries relative to whatever the current directory happens to be. An attacker who controls the working directory could place malicious binaries there.

## Expected Behavior

If HOME is not set, skip the cargo/bun PATH additions entirely instead of using the current directory:

```rust
if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
    // Add cargo/bun to PATH
}
```

## Resolution

Changed the PATH construction to only add cargo/bun/local bin directories when HOME (or USERPROFILE) is available. When neither is set, only `/opt/homebrew/bin` is prepended to the existing PATH, avoiding the dangerous `.` fallback.

