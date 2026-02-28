# file_read Fails on Binary Files With No Fallback

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

In `apps/agent/src/tools/file_read.rs`, `std::fs::read_to_string()` fails with an error if the file contains invalid UTF-8 (binary files, images, compiled binaries, etc.). The LLM gets an opaque error message instead of useful information.

When the LLM asks to read a binary file (which happens when exploring unfamiliar codebases), it should get a clear message explaining the file is binary, not a cryptic UTF-8 decode error.

## Expected Behavior

Detect binary files and return a helpful message:

```
"File appears to be binary (not valid UTF-8). Size: 1.2 MB. Use shell_exec with appropriate tools (hexdump, file, etc.) to inspect binary files."
```

## Implementation Notes

In `file_read.rs`, try `read_to_string()` first. If it fails with a UTF-8 error, fall back to checking the file type:

```rust
match std::fs::read_to_string(&path) {
    Ok(content) => { /* existing logic */ },
    Err(e) if e.kind() == std::io::ErrorKind::InvalidData => {
        let size = std::fs::metadata(&path)?.len();
        Ok(format!("Binary file ({} bytes). Use shell_exec to inspect.", size))
    },
    Err(e) => Err(e.into()),
}
```

## Resolution

Changed `file_read.rs` to catch `InvalidData` errors from `read_to_string` (which fires on non-UTF-8 content). Instead of propagating the error, it returns `"Binary file (N bytes). Use shell_exec to inspect."` with the file size. Other errors still propagate normally. Agent binary rebuilt and installed.
