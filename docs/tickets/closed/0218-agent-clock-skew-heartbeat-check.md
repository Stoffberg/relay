# Agent Freshness Check Vulnerable to Clock Skew

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The `is_agent_fresh` function compares the agent's `last_heartbeat` timestamp (set by SpacetimeDB server time via the `agent_heartbeat` reducer) against `SystemTime::now()` (the Fly.io server's local time). If there's clock skew between the Fly.io instance and the SpacetimeDB maincloud server, the agent could appear stale when it's actually healthy, or appear fresh when it's actually dead.

The heartbeat interval is 30 seconds and the staleness threshold is 90 seconds, so any clock skew over 60 seconds would cause false negatives (agent appears stale when healthy). Clock skew in the other direction could mask a dead agent for longer than intended.

## Expected Behavior

The freshness check should either use the same clock source for both timestamps, or account for potential clock skew. Options include:

1. Having the server record its own timestamp when it receives a heartbeat subscription update, then compare against that
2. Using a relative comparison (time since last heartbeat update observed, not absolute timestamp comparison)
3. Adding a tolerance margin to the staleness threshold

## Implementation Notes

The simplest fix: track `last_heartbeat_observed_at` using the server's local clock in the `on_update` callback for the agent table, then compare `SystemTime::now() - last_heartbeat_observed_at > 90s`.

## Resolution

Added `agent_heartbeat_observed` HashMap to AppState that records `Instant::now()` when an agent's heartbeat is received via the SpacetimeDB subscription on_update callback. The `has_online_agent` and `find_agent_id` functions now compare `Instant::now() - last_observed` against the 90s threshold instead of comparing SpacetimeDB timestamps against the server's system clock. This eliminates clock skew between Fly.io and SpacetimeDB maincloud.
