# file_edit Uses Non-Atomic Write That Can Corrupt Files

**Type:** bug
**Severity:** high
**Component:** agent
**Reported:** 2026-02-27

## Description

The file_edit tool reads a file into memory, performs the replacement, then writes the result back with `fs::write()`. The write call truncates the file immediately before writing new content. If the process is killed or an I/O error occurs mid-write, the file is left in a corrupted (partially written or empty) state.

In `apps/agent/src/tools/file_edit.rs` around line 20:

```rust
fs::write(path, &updated)?;
```

This is the same issue as `fs::write()` non-atomicity in ticket 0129 (agent config), but here it affects user files that may be source code, configuration, or other important data.

## Expected Behavior

Use atomic write (write to temp file, then rename):

```rust
let tmp_path = format!("{}.tmp", path.display());
fs::write(&tmp_path, &updated)?;
fs::rename(&tmp_path, path)?;
```

This ensures the file is either the old version or the new version, never a partial write.

## Implementation Notes

The `rename` system call is atomic on most Unix filesystems when source and destination are on the same filesystem. The temp file should be created in the same directory as the target to ensure this.

Also applies to `file_write.rs` which likely has the same issue.

## Resolution

Both `file_edit` and `file_write` now use atomic writes: content is written to a `.tmp` file in the same directory, then renamed into place. This ensures files are never left in a partially written state on crash or I/O error.

