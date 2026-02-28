# Agent Rows Accumulate in SpacetimeDB Without Garbage Collection

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

Every agent startup generates a new agent ID (`agent-{uuid8}`) and creates a new row in the `agent` table via `register_agent`. If the agent process crashes, is SIGKILL'd, or the machine loses power, the `agent_disconnect` reducer never runs and the old agent row stays in the database with status "online".

The server's heartbeat staleness check (90 seconds) will eventually consider these agents stale for tool dispatch purposes, but the rows themselves are never cleaned up. Over time, the agent table accumulates dead rows.

Additionally, the `register_agent` reducer only updates status and heartbeat for existing IDs, but since each startup uses a new ID, it never hits the "already exists" path for crashed agents.

## Expected Behavior

Either:
1. The agent should reuse a stable ID (e.g., derived from machine hostname or a persisted config value) so restarts update the existing row instead of creating new ones
2. Or the SpacetimeDB module should have a cleanup reducer that removes agents whose heartbeat is older than some threshold (e.g., 5 minutes)

## Implementation Notes

Option 1 (recommended): Store the agent ID in the config file (`~/.config/relay/config.toml`) on first registration. Reuse it on subsequent startups. The `register_agent` reducer already handles re-registration by updating status and heartbeat.

Option 2: Add a `cleanup_stale_agents` reducer that deletes agents with `last_heartbeat` older than 5 minutes. Call it periodically from the server.

## Resolution

Added `agent_id` field (optional) to `AgentConfig`. On first run, generates a UUID-based ID and persists it to `~/.config/relay/config.toml`. On subsequent runs, reuses the same ID. The `register_agent` reducer's existing re-registration logic handles updating status and heartbeat for the returning agent. Old agent rows from before this change will become stale via the heartbeat check. The `#[serde(default)]` attribute ensures backward compatibility with existing config files.
