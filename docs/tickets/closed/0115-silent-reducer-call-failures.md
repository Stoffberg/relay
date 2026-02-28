# Silent Reducer Call Failures Not Logged

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

Multiple SpacetimeDB reducer calls throughout the server use `let _ =` to discard errors without any logging. While some are intentional (e.g., `create_session` which returns OK if session exists), others silently drop real failures that should be visible in logs.

Affected locations in `apps/server/src/main.rs`:
- `update_session_status` calls (lines ~546, 604): session status changes silently fail
- `complete_message` calls (line ~887): message completion silently fails, could leave messages stuck
- `fail_message` calls (line ~925): error recording silently fails, losing diagnostic info
- `append_message_part` in streaming (line ~966): content parts silently dropped

## Expected Behavior

All reducer calls that affect message or session state should log on failure at `warn!` or `error!` level. The `let _ =` pattern is fine for truly optional operations (like title updates on an already-titled session) but not for state transitions that affect correctness.

## Implementation Notes

Replace `let _ = reducer_call(...)` with:

```rust
if let Err(e) = reducer_call(...) {
    tracing::warn!("Failed to {action}: {e}");
}
```

Keep `let _ =` only for `create_session` (idempotent by design) and similar intentionally-ignored results.

## Resolution

Replaced `let _ =` with `if let Err(e) = ... { tracing::warn!(...) }` for all critical state transitions: `complete_message`, `update_session_status` (streaming and idle), `fail_message` in error recovery, and `update_session_status` for tool call phases. Kept `let _ =` only for `update_session_title` (optional) and `create_session` (idempotent by design). All warnings include the session_id for correlation.

