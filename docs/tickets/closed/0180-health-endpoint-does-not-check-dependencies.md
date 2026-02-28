# Health Endpoint Does Not Check SpacetimeDB or OpenRouter Connectivity

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The `/health` endpoint always returns `{"status": "ok"}` with HTTP 200, regardless of whether the server can actually process requests. It does not check:

1. SpacetimeDB connection is alive and subscriptions are active
2. OpenRouter API key is valid and the service is reachable
3. Any useful diagnostics (uptime, active sessions, cache size, version)

In `apps/server/src/main.rs` around lines 420-422:

```rust
async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok" }))
}
```

This means Fly.io's health checks always pass, even if the server is disconnected from SpacetimeDB and unable to process any messages.

## Expected Behavior

Return a meaningful health check that reflects actual service readiness:

```json
{
    "status": "ok",
    "spacetimedb": "connected",
    "active_sessions": 3,
    "uptime_seconds": 1234
}
```

If SpacetimeDB is disconnected, return HTTP 503 with `"status": "degraded"` so Fly.io can detect the issue and restart the machine.

## Implementation Notes

Check `state.conn` for connection status. The SpacetimeDB SDK should expose whether the WebSocket is still connected. If not directly available, track connection state via the `on_disconnect` callback and expose it through a shared atomic boolean.

For OpenRouter, a periodic background check (not on every health request) that validates the API key and caches the result would avoid adding latency to the health endpoint.

## Resolution

Updated the `/health` endpoint to accept `State(state)` and check SpacetimeDB connectivity via an `Arc<AtomicBool>` (`db_connected`) that is set `true` in `on_connect` and `false` in `on_disconnect`. The handler now returns `{"status": "ok", "db_connected": true, "uptime_seconds": N, "active_sessions": N}` with HTTP 200 when connected, or `{"status": "degraded", ...}` with HTTP 503 when disconnected. This lets Fly.io health checks detect a stale server and restart it. Deployed and verified: returns `db_connected: true`, `active_sessions`, and `uptime_seconds`.

