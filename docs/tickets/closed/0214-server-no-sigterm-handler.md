# Server Only Handles SIGINT, Not SIGTERM

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

The server's graceful shutdown handler only listens for `ctrl_c()` (SIGINT). On Fly.io, the platform sends SIGTERM for graceful shutdown, not SIGINT. This means the server will be hard-killed after the grace period instead of properly draining connections and cleaning up active sessions.

Note: ticket 0072 (closed) added a graceful shutdown handler, but it only handles SIGINT via `tokio::signal::ctrl_c()`. SIGTERM is the standard signal for graceful shutdown on Linux and is what Fly.io sends.

## Steps to Reproduce

1. Deploy to Fly.io
2. Trigger a machine stop (via autostop or `fly machine stop`)
3. Fly sends SIGTERM
4. Server ignores it and gets hard-killed after the grace period
5. Active sessions are not drained, connections are not closed cleanly

## Expected Behavior

The server should handle both SIGINT and SIGTERM for graceful shutdown.

## Implementation Notes

Use `tokio::select!` to listen for both signals:

```rust
let ctrl_c = tokio::signal::ctrl_c();
let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).unwrap();
tokio::select! {
    _ = ctrl_c => {},
    _ = sigterm.recv() => {},
}
```

## Resolution

Added SIGTERM handling alongside the existing SIGINT (ctrl_c) handler using `tokio::select!`. The server now installs a `unix::signal(SignalKind::terminate())` handler and shuts down gracefully on either signal. This matches Fly.io's shutdown protocol which sends SIGTERM.
