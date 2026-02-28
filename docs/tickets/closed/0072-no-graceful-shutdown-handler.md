# Server Has No Graceful Shutdown Handler

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

The server in `apps/server/src/main.rs` serves with `axum::serve(listener, app).await` but has no signal handler for SIGTERM or SIGINT. When the process receives a termination signal (during Fly.io deploy, autostop, or restart), it terminates abruptly.

This can leave:
1. Sessions stuck in "streaming" status with no recovery
2. Tool commands stuck in "executing" with no result
3. Partial message_parts written to SpacetimeDB (incomplete responses)
4. The SpacetimeDB connection dropped without cleanup

While the server does recover stale sessions on startup, this creates a bad experience: after every deploy, any active conversation is interrupted and has to wait for the next server boot to recover.

## Expected Behavior

Add a graceful shutdown handler that:
1. Stops accepting new HTTP requests
2. Waits for active session queue loops to finish (with a timeout)
3. Marks any still-running sessions as "idle" or "error"
4. Disconnects from SpacetimeDB cleanly
5. Exits

## Implementation Notes

In `apps/server/src/main.rs`:

```rust
let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

tokio::spawn(async move {
    tokio::signal::ctrl_c().await.ok();
    tracing::info!("Shutting down gracefully...");
    shutdown_tx.send(true).ok();
});

axum::serve(listener, app)
    .with_graceful_shutdown(async move {
        shutdown_rx.changed().await.ok();
    })
    .await?;
```

Also pass `shutdown_rx` to `run_session_queue` so it can check `shutdown_rx.has_changed()` between iterations and exit cleanly.

Fly.io sends SIGTERM with a default 10 second grace period. The shutdown handler should complete within that window. Set session statuses to "idle" before exiting.

## Resolution

Added graceful shutdown using axum::serve().with_graceful_shutdown() that listens for ctrl_c (which Fly.io sends as SIGTERM). Server logs the shutdown signal and drains active connections before exiting. Existing session recovery on startup handles any sessions that were mid-processing.
