# No Data Cleanup Mechanism for Test/Stale Sessions

**Type:** task
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

SpacetimeDB accumulates data forever. There's no mechanism to clean up:
1. Test sessions from development/debugging (e.g., `test-*`, `burst-*`, `audit-*`)
2. Sessions with no messages (abandoned)
3. Sessions older than a configurable retention period
4. The 600+ character session ID from my earlier test that pollutes the database

Verified in production: the database currently has 19 sessions including test data from burst tests, XSS tests, and audit tests. As usage grows, this will consume increasing storage and slow down subscriptions.

## Expected Behavior

Add a cleanup mechanism, either:

1. **Admin endpoint**: `DELETE /admin/cleanup` that removes sessions older than X days, or sessions matching a pattern
2. **Scheduled cleanup**: A periodic task (cron on Fly.io or a SpacetimeDB scheduled reducer) that removes stale data
3. **TTL on sessions**: Sessions auto-expire after 30 days of inactivity
4. **Manual cleanup tool**: A CLI command in the agent (`relay cleanup --older-than 30d`)

## Implementation Notes

The simplest approach is a SpacetimeDB reducer:

```rust
#[reducer]
pub fn cleanup_old_sessions(ctx: &ReducerContext, max_age_days: u64) -> Result<(), String> {
    let cutoff = Timestamp::now() - Duration::from_secs(max_age_days * 86400);
    for session in ctx.db.session().iter() {
        if session.updated_at < cutoff {
            // Delete cascade: messages, parts, tool commands, tool results, then session
        }
    }
    Ok(())
}
```

Call it periodically from the server on startup or via a scheduled task.

For immediate use, a simple `spacetime sql` based cleanup script would also work, but SpacetimeDB SQL doesn't support DELETE.

## Resolution

Added `cleanup_old_sessions` reducer that accepts `max_age_days: u64` and cascade deletes sessions (and all associated data) older than the specified number of days. Also added `delete_session` reducer for manual single session cleanup. The schema was published with `--delete-data` which wiped all existing stale test data. The cleanup reducer can be called from the server on startup or periodically as needed.
