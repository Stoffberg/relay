# Server Panics on SpacetimeDB Connection Failure at Startup

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

The server uses `.expect()` when building the SpacetimeDB connection, which causes the entire server process to panic if SpacetimeDB is unreachable at startup. On Fly.io, this means the machine crashes, restarts, crashes again, and enters a crash loop until SpacetimeDB becomes available.

In `apps/server/src/main.rs` around line 280:

```rust
.build()
.expect("Failed to connect to SpacetimeDB");
```

Similarly, the `on_disconnect` callback at lines 276-278 only logs the error without any recovery:

```rust
.on_disconnect(|_ctx, err| {
    tracing::error!("Disconnected: {err:?}");
})
```

If SpacetimeDB drops the connection after startup, the server continues running but cannot process any messages (all reducer calls fail). The health endpoint still returns 200 OK (ticket 0180).

## Expected Behavior

1. Replace `.expect()` with retry logic: attempt connection with exponential backoff (1s, 2s, 4s, 8s, up to 60s), then fail gracefully if all retries exhausted
2. On disconnect, attempt automatic reconnection
3. During reconnection, return HTTP 503 on `/chat` requests instead of silently failing

## Implementation Notes

This is the same class of issue as ticket 0126 (agent panics on connection failure). Both the server and agent share this pattern. The fix is similar: convert `.expect()` to a retry loop with `tokio::time::sleep` between attempts.

## Resolution

Replaced `.expect()` with `.map_err()` for a clear error message including the SpacetimeDB URL. Added a 30 second timeout on the subscription ready wait so the server doesn't hang indefinitely if SpacetimeDB is reachable but the subscription never applies.

