# Agent Panics on SpacetimeDB Unreachable

**Type:** bug
**Severity:** high
**Component:** agent
**Reported:** 2026-02-27

## Description

The agent uses `.expect()` when building the SpacetimeDB connection, which causes a panic (crash) if the database is unreachable. This gives the user no opportunity to recover, retry, or see a helpful error message.

In `apps/agent/src/main.rs` around line 334:

```rust
.build()
.expect("Failed to connect to SpacetimeDB");
```

Additionally, the subscription ready wait at line 370 blocks indefinitely with no timeout:

```rust
ready_rx.await?;
```

If SpacetimeDB accepts the connection but the subscription never fires `on_applied` (e.g., database name wrong, schema mismatch), the agent hangs forever.

## Expected Behavior

1. Replace `.expect()` with proper error handling that prints a user-friendly message and exits with a non-zero code
2. Add a timeout on subscription ready (e.g., 30 seconds) with a clear error message
3. Optionally retry the connection with exponential backoff (1s, 2s, 4s, up to 30s)

## Implementation Notes

```rust
let conn = DbConnection::builder()
    // ...
    .build()
    .map_err(|e| anyhow::anyhow!("Could not connect to SpacetimeDB at {}: {e}", config.spacetime_url))?;

// With timeout:
tokio::time::timeout(Duration::from_secs(30), ready_rx)
    .await
    .map_err(|_| anyhow::anyhow!("Timed out waiting for SpacetimeDB subscription (30s)"))?
    .map_err(|_| anyhow::anyhow!("Subscription channel closed unexpectedly"))?;
```

## Resolution

Replaced `.expect()` with `.map_err()` for a user friendly error message including the URL. Added a 30 second timeout on the subscription ready wait so the agent doesn't hang indefinitely on schema mismatch or unreachable database.

