# Stale Test Data Accumulates in SpacetimeDB

**Type:** task
**Severity:** low
**Component:** server
**Reported:** 2026-02-27

## Description

The production SpacetimeDB instance contains 20+ test sessions from manual testing and automated audits. These include sessions like `test-empty-msg`, `test-xss`, `audit-test-unicode`, `audit-burst-1`, `burst-test-*`, `rl-test-1`, `dedup-test`, and a session with a 256-character all-A session ID.

Some of these have stuck messages (e.g., `test-empty-msg` has a queued message with empty content that will never be processed). There's also a stuck queued message (`85ce3649-8aa9-447f-87bd-628c87eea352`) from the empty message bug that was fixed on the server side but never cleaned up in the database.

No agents are registered (agent table is empty), so any sessions stuck in non-idle states from earlier agent testing are also stale.

## Expected Behavior

1. Add a data cleanup mechanism (relates to ticket 0085) or admin endpoint to purge test sessions
2. For the immediate stuck message: either complete it or delete it via a SpacetimeDB reducer
3. Consider a "purge test data" reducer that deletes sessions matching known test prefixes (`test-*`, `audit-*`, `burst-*`, `rl-*`, `dedup-*`)

## Implementation Notes

This is distinct from ticket 0085 (which proposes automated stale session cleanup). This ticket is about the immediate state of the production database having garbage test data. A one-time cleanup via `spacetime sql` or a temporary reducer would suffice.

## Resolution

All stale test data was wiped when the schema was published with `--delete-data` during the batch schema update (adding model, system_prompt, is_archived fields and new reducers). Going forward, the `delete_session` reducer handles individual session cleanup and `cleanup_old_sessions` handles bulk cleanup by age. Users can also delete sessions directly from the sidebar context menu.

