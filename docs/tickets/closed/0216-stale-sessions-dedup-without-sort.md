# Stale Session Recovery dedup() Called Without sort()

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The server's startup recovery logic collects stale session IDs into a `Vec<String>` from two sources (non-idle sessions and sessions with queued messages), then calls `.dedup()` to remove duplicates. However, `Vec::dedup()` only removes consecutive duplicates. Without a preceding `.sort()`, non-consecutive duplicates survive and the same session gets recovered twice.

When a session is recovered twice, two concurrent `run_session_queue` tasks spawn for the same session, which could cause double-processing of queued messages or race conditions on session status updates.

## Steps to Reproduce

1. Have a session that is both non-idle AND has queued messages
2. The session ID appears in both collection sources
3. If the IDs happen to be non-adjacent in the vec, `dedup()` doesn't catch it
4. Two recovery tasks spawn for the same session

## Expected Behavior

Either sort before dedup, or use a `HashSet` to collect unique session IDs.

## Implementation Notes

Replace the `Vec` + `dedup()` with a `HashSet<String>`, or add `.sort()` before `.dedup()`. A `HashSet` is cleaner:

```rust
let stale_sessions: HashSet<String> = /* collect from both sources */;
```

## Resolution

Replaced the `Vec` + `dedup()` pattern with `collect::<HashSet<_>>().into_iter().collect()` for proper deduplication regardless of element ordering. The HashSet guarantees uniqueness without requiring the elements to be sorted first.
