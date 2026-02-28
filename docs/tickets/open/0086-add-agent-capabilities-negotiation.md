# Add Agent Capabilities Negotiation

**Type:** feature
**Severity:** medium
**Component:** agent, server
**Reported:** 2026-02-27

## Description

The server assumes all agents support all 7 tools (file_read, file_write, file_edit, shell_exec, glob, grep, list_dir). If in the future different agents have different capabilities (e.g., a read-only agent, or an agent with web_fetch), the server has no way to know which tools to advertise to the LLM.

## Expected Behavior

1. Agent registers with a list of supported tools during `register_agent`
2. Server reads the agent's capabilities from the subscription cache
3. Only tools supported by the connected agent are sent to the LLM
4. If no agent supports a tool, it's not included in tool definitions

## Implementation Notes

### Schema
Add `capabilities: String` to the `Agent` table (JSON array of tool names, or comma-separated list).

### Agent
In `register_agent` call, include the list of tools the agent supports:

```rust
conn.reducers.register_agent(agent_id, agent_name, capabilities_json);
```

### Server
In `tool_definitions()`, filter by the agent's capabilities:

```rust
let agent_tools: HashSet<String> = parse_capabilities(&agent.capabilities);
let definitions = all_tool_definitions()
    .into_iter()
    .filter(|t| agent_tools.contains(&t.name))
    .collect();
```

This also enables future agents on different platforms (e.g., a mobile agent that can only do file_read and list_dir).

## Resolution

_(fill in when resolving)_
