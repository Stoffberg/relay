# file_edit and file_read Load Entire File Into Memory

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

Both `file_edit` and `file_read` tools use `fs::read_to_string()` which loads the entire file into memory at once. If the LLM requests an edit on a very large file (e.g., a database dump, log file, or binary accidentally named `.txt`), the agent can exhaust available memory and crash.

In `apps/agent/src/tools/file_edit.rs` line 5:
```rust
let content = fs::read_to_string(path)?;
```

In `apps/agent/src/tools/file_read.rs`, the same pattern is used.

## Expected Behavior

Check file size before reading and reject files over a reasonable threshold (e.g., 10MB):

```rust
let metadata = fs::metadata(path)?;
if metadata.len() > 10_000_000 {
    return Err(anyhow!("File too large ({} bytes). Maximum supported size is 10MB.", metadata.len()));
}
```

For `file_read`, the line-based limit (default 2000 lines) partially mitigates this, but a file with 2000 lines of 1MB each would still consume 2GB.

## Resolution

Added a 10MB file size check via `fs::metadata()` before `fs::read_to_string()` in both `file_edit` and `file_read`. Files exceeding 10MB are rejected with a clear error message showing the file size and the limit. This prevents OOM from accidentally operating on large files.

