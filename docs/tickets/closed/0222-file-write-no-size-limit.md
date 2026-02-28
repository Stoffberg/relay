# file_write Tool Has No File Size Limit

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

The `file_write` tool accepts content of any size with no limit, unlike `file_read` and `file_edit` which both enforce a 10MB maximum. A confused or manipulated LLM could write an enormous file, exhausting disk space on the user's machine.

## Expected Behavior

Apply the same 10MB limit that `file_read` and `file_edit` enforce. Reject writes where the content exceeds this threshold with a clear error message.

## Implementation Notes

Add a size check at the start of the `file_write` function:

```rust
if content.len() > 10_000_000 {
    return Err(anyhow::anyhow!("Content too large ({} bytes). Maximum is 10MB.", content.len()));
}
```

## Resolution

Added a 10MB size check at the start of `file_write::execute()`, matching the limit enforced by `file_read` and `file_edit`. Content exceeding 10,000,000 bytes is rejected with a clear error message showing the actual size.
