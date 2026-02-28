# Add Explicit Health Check Config to Fly.toml

**Type:** task
**Severity:** medium
**Component:** infra
**Reported:** 2026-02-27

## Description

The `apps/server/Fly.toml` has no explicit health check configuration. Fly.io uses defaults which may not be optimal for this server:

1. The server connects to SpacetimeDB on startup (takes 1 to 2 seconds)
2. Tool calls can block for up to 120 seconds
3. Default Fly health check timeout may be too aggressive for cold starts

Without explicit config, Fly may mark the server unhealthy during normal operation or fail to detect actual issues.

## Expected Behavior

Add explicit health check config to Fly.toml:

```toml
[[services.tcp_checks]]
  interval = "15s"
  timeout = "5s"
  grace_period = "10s"

[[services.http_checks]]
  interval = "15s"
  timeout = "5s"
  grace_period = "10s"
  method = "get"
  path = "/health"
```

The grace period of 10 seconds gives the server time to connect to SpacetimeDB on cold start.

## Implementation Notes

In `apps/server/Fly.toml`, add the health check section. The current `[[services]]` section (or `[http_service]`) should include the checks. Check Fly.io docs for the exact syntax for the current Fly.toml format version.

## Resolution

Added explicit HTTP health check config to Fly.toml under [http_service.checks]. Checks GET /health every 15 seconds with a 5 second timeout and 10 second grace period for cold starts (SpacetimeDB connection takes 1-2 seconds).
