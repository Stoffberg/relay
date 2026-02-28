# Unbounded Task Spawning on Stale Session Recovery

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

On startup, the server iterates all sessions in SpacetimeDB and spawns a `tokio::spawn` task for every session that has a non-idle status. If the database has accumulated hundreds of stale sessions (from crashes, autostop, etc.), this fires hundreds of concurrent tasks with no backpressure or concurrency limit.

In `apps/server/src/main.rs` around lines 354-357:

```rust
tokio::spawn(async move {
    run_session_queue(&state_clone, &sid).await;
});
```

Each spawned task runs `run_session_queue`, which does polling, LLM calls, and database writes. Hundreds of these running simultaneously could exhaust memory, saturate the OpenRouter API, and cause cascading timeouts.

## Expected Behavior

Use a semaphore or bounded channel to limit concurrent session recovery. Something like 5 to 10 sessions recovering at a time, with the rest queued.

## Implementation Notes

A `tokio::sync::Semaphore` with a reasonable permit count (e.g., 5) would cap concurrency. Each spawned task acquires a permit before proceeding and releases it when done.

## Resolution

Added `tokio::sync::Semaphore::new(5)` to cap concurrent stale session recovery. Each spawned recovery task acquires a permit before calling `run_session_queue`, limiting concurrency to 5 simultaneous sessions.

