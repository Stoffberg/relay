# Add Multi-Agent Support (Multiple Machines)

**Type:** feature
**Severity:** low
**Component:** server, agent
**Reported:** 2026-02-27

## Description

The system currently supports one agent at a time. The server checks `has_online_agent` as a boolean and dispatches tool commands to whichever agent matches. But the schema already supports multiple agents (`agent` table with individual IDs).

Multi-agent support would let users:
1. Run agents on different machines (laptop + desktop + server)
2. Have specialized agents (one for code, one for deployment)
3. Route tool commands to the appropriate agent based on capabilities or location

## Expected Behavior

1. Multiple agents can register simultaneously
2. The server shows all online agents in the UI
3. Tool commands are routed to the most appropriate agent (e.g., the one with the matching working directory)
4. If the primary agent is busy or offline, fall back to another

## Implementation Notes

### Server
1. When dispatching a tool call, choose the best agent based on: status (online), last_heartbeat (freshest), capabilities (if implemented per ticket 0086)
2. Include the agent_id in the tool_command row
3. If the chosen agent doesn't respond within timeout, try another

### Agent
1. Each agent has a unique ID (already the case)
2. Agents only pick up tool commands assigned to their agent_id

### Frontend
1. Show connected agents in the sidebar or chat header
2. Allow selecting which agent to use for a session

This is a longer-term feature but the schema already supports it.

## Resolution

_(fill in when resolving)_
