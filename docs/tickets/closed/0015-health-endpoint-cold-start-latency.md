# Health Endpoint Cold Start Takes 2.7 Seconds

**Type:** bug
**Severity:** medium
**Component:** server, infra
**Reported:** 2026-02-26

## Description

The `/health` endpoint took 2743ms on a cold start against the live `code-api.stoff.dev` server. Subsequent requests are 200 to 330ms. This suggests Fly.io is autostopping the machine and the cold boot + SpacetimeDB connection takes nearly 3 seconds.

This matters because:
1. The frontend's first API call will be slow if the server has been idle
2. Uptime monitoring services may report false downtimes
3. Users experience a long delay on their first message after a period of inactivity

## Steps to Reproduce

1. Wait 5+ minutes for Fly.io to autostop the machine
2. `curl -w '%{time_total}' https://code-api.stoff.dev/health`
3. Observe ~2.5 to 3 second response time
4. Repeat immediately: response is 200 to 400ms

## Expected Behavior

Options to improve:

1. **Disable autostop**: In `Fly.toml`, set `auto_stop_machines = "off"`. Costs more but eliminates cold starts. Only worth it if usage is frequent.
2. **Health check prewarming**: Add a scheduled health check (e.g., via UptimeRobot or a cron) that pings `/health` every 2 minutes to keep the machine warm.
3. **Lazy SpacetimeDB connection**: Move the SpacetimeDB connection out of the startup path. Start the HTTP server immediately, connect to SpacetimeDB in the background. The `/health` endpoint can respond instantly while `/chat` waits for the DB connection. This reduces cold start from 2.7s to under 500ms for health checks.
4. **Frontend preconnect**: Have the frontend hit `/health` on page load to warm the server before the user sends their first message.

Option 4 is the cheapest quick win. Option 3 is the most architecturally sound.

## Resolution

Added fire-and-forget `fetch('/health')` call in the root component's SpacetimeDB connection effect. This prewarms the Fly.io server on page load before the user sends their first message, reducing perceived cold start latency from ~2.7s to near zero for the first chat message.
