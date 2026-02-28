# Path Validation Bypass via Non-Existent Parent Directories

**Type:** bug
**Severity:** critical
**Component:** agent
**Reported:** 2026-02-27

## Description

The `validate_path` function in the agent's tool module has a bypass when neither the target file nor its parent directory exists. In this case, the path is used as-is without canonicalization. A path like `/Users/dirk.beukes/nonexistent/../../etc/shadow` passes the `starts_with` check because `PathBuf::starts_with` matches on path components, and the first three components match `$HOME`. However, when the OS resolves the `..` segments during the actual file operation, it writes to `/etc/shadow`.

This affects `file_write` (can create files outside `$HOME`), `file_edit`, and `file_read` when the intermediate directory doesn't exist.

Note: ticket 0112 (closed) added `validate_path` with the `$HOME` check, but this specific bypass through non-existent parents was not addressed.

## Steps to Reproduce

1. Ensure `/Users/dirk.beukes/nonexistent/` does not exist
2. Call `file_write` with path `/Users/dirk.beukes/nonexistent/../../tmp/test.txt`
3. `validate_path` checks components `["/", "Users", "dirk.beukes", "nonexistent", "..", "..", "tmp", "test.txt"]`
4. `starts_with("/Users/dirk.beukes")` returns true (first 3 components match)
5. `file_write` creates parent dirs and writes to `/tmp/test.txt`

## Expected Behavior

Paths containing `..` segments should be rejected outright, or the path should be normalized (resolving `.` and `..`) before the `starts_with` check, even when the target doesn't exist.

## Implementation Notes

Simplest fix: reject any path containing `..` components before the `starts_with` check. The glob tool already blocks `..` in patterns. Apply the same check in `validate_path`:

```rust
if resolved.components().any(|c| c == std::path::Component::ParentDir) {
    return Err(anyhow::anyhow!("Path traversal (..) is not allowed"));
}
```

## Resolution

Added an explicit check that rejects any path containing `..` (ParentDir) components before the `starts_with` check. Uses `std::path::Component::ParentDir` matching on the path's components iterator. This prevents the bypass where non-existent parent directories allowed path traversal through uncanonicalized `..` segments.
