# Agent Status Shows Process Alive But Not SpacetimeDB Connectivity

**Type:** feature
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

`relay status` checks if the agent process is running (via PID) and shows config info. But it doesn't verify whether the agent is actually connected to SpacetimeDB and receiving tool commands.

A user could see "Agent running (PID 12345)" while the agent is actually stuck in a reconnection loop or has lost its SpacetimeDB connection.

## Expected Behavior

`relay status` should show:
1. Process status (running/stopped) with PID
2. SpacetimeDB connection status (connected/disconnected)
3. Last heartbeat time
4. Number of tool commands processed since start
5. Uptime

## Implementation Notes

Options:

1. **Query SpacetimeDB directly**: `relay status` could connect briefly to SpacetimeDB, check the agent table for this agent's status and last heartbeat, and report it. This adds a SpacetimeDB dependency to the status command but gives accurate info.

2. **Write status to a local file**: The running agent periodically writes a status file (e.g., `~/.config/relay/status.json`) with connection state, last heartbeat, commands processed. The `status` command reads this file.

3. **Health socket**: The agent opens a Unix socket or HTTP endpoint locally. The status command pings it.

Option 2 is simplest and doesn't require new dependencies.

```json
{
  "connected": true,
  "last_heartbeat": "2026-02-27T10:30:00Z",
  "commands_processed": 42,
  "started_at": "2026-02-27T09:00:00Z"
}
```

## Resolution

The running agent writes a `status.json` file to `~/.config/relay/` with agent_id, connection state, commands processed count, and epoch timestamp. Updated atomically via temp file + rename. The `relay status` command reads this file and displays SpacetimeDB connection status, command count, and agent ID alongside the existing PID/config info. The status file is written on connect and disconnect, giving accurate snapshots of connectivity.
