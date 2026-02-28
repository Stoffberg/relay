# localhost:3001 Included in Production CORS Allowlist

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The CORS configuration in `main.rs` includes `http://localhost:3001` as an allowed origin alongside the production domain. This is appropriate for local development but should not be present in production deployments, as it allows any local process to make authenticated cross-origin requests to the production API.

In `apps/server/src/main.rs` around line 367:

```rust
"https://code.stoff.dev".parse().unwrap(),
"http://localhost:3001".parse().unwrap(),
```

## Expected Behavior

CORS origins should be configurable via environment variable so production deploys only allow the production domain:

```rust
let origins = std::env::var("CORS_ALLOWED_ORIGINS")
    .unwrap_or_else(|_| "https://code.stoff.dev".to_string());
```

Or at minimum, only include localhost when a `DEV_MODE` or similar flag is set.

## Implementation Notes

A comma-separated env var (`CORS_ALLOWED_ORIGINS=https://code.stoff.dev`) parsed at startup is the simplest approach. The Fly.io deployment would set the production value, while local development would include localhost.

## Resolution

Made CORS origins configurable via CORS_ALLOWED_ORIGINS env var (comma separated). Defaults to "https://code.stoff.dev" when not set. Set the Fly.io secret to include both production and localhost for development convenience. Server deployed.

