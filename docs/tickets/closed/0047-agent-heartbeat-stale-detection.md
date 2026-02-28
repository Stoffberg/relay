# Agent Stays "Online" Forever If It Crashes Without Disconnecting

**Type:** bug
**Severity:** high
**Component:** server, agent
**Reported:** 2026-02-27

## Description

The agent sends heartbeats every 30 seconds (`HEARTBEAT_INTERVAL_SECS = 30` in agent `main.rs`). If the agent process is killed (SIGKILL, OOM, power loss), it never calls `agent_disconnect`, so the agent row stays with status "online" in SpacetimeDB.

The server checks `has_online_agent` to decide whether to include tools in the LLM conversation. If a dead agent is still marked "online", the server will:
1. Send tool definitions to the LLM
2. The LLM will try to use tools
3. `dispatch_tool_call` will create tool commands
4. Nobody picks them up
5. After 120 seconds, the tool call times out
6. The user sees "tool execution timed out" for every tool call

This is a terrible user experience that persists until someone manually marks the agent offline.

## Expected Behavior

The server should check the agent's `last_heartbeat` timestamp and consider agents with a stale heartbeat (e.g., > 90 seconds old) as offline. Two approaches:

1. **Server side**: Before checking `has_online_agent`, also verify the agent's `last_heartbeat` is within the last 90 seconds. If not, treat it as offline.

2. **SpacetimeDB side**: Add a reducer `cleanup_stale_agents` that the server calls periodically, marking agents with stale heartbeats as "offline".

Option 1 is simpler and doesn't require a schema change.

## Implementation Notes

In `apps/server/src/main.rs`, where `has_online_agent` is computed, add a heartbeat freshness check:

```rust
let has_online_agent = state.conn.db.agent().iter().any(|a| {
    a.status == "online" && {
        let heartbeat_ms = extract_timestamp(&a.last_heartbeat);
        let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
        now_ms - heartbeat_ms < 90_000 // Within last 90 seconds
    }
});
```

This adds negligible overhead and prevents the dead agent problem entirely.

## Resolution

Added `is_agent_fresh` helper in the server that checks both `status == "online"` and that `last_heartbeat` is within the last 90 seconds (using `to_micros_since_unix_epoch()`). Both `has_online_agent` and `find_agent_id` now use this check, so a dead agent with a stale heartbeat is treated as offline. Server deployed to Fly.io and verified healthy.
