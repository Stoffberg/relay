# Agent Processes Tool Commands Assigned to Other Agents

**Type:** bug
**Severity:** high
**Component:** agent
**Reported:** 2026-02-27

## Description

In `apps/agent/src/main.rs` around line 337, the agent's tool command handler only filters by `status == "pending"` but does not verify that `cmd.agent_id` matches the current agent's ID. This means any running agent will pick up and execute any pending command, even if it was assigned to a different agent.

In a multi-agent setup (ticket 0099 proposes this), this causes:
- Commands executing on the wrong machine
- Race conditions where two agents both grab the same command
- Security issues if agents have different filesystem access

## Steps to Reproduce

1. Register two agents with different IDs
2. Send a tool command assigned to agent A
3. Agent B picks it up and executes it

## Expected Behavior

The agent should filter by both status and agent_id:

```rust
if cmd.status == "pending" && cmd.agent_id == state.agent_id {
    // execute
}
```

## Implementation Notes

Single line filter addition. Also worth checking if the server correctly sets `agent_id` when creating tool commands, or if it always picks the first online agent.

## Resolution

Added agent_id filtering to all three places tool commands are picked up: the on_insert listener, the on_update listener, and the initial pending batch filter. Each now checks cmd.agent_id == agent_id before sending to the channel. Agent rebuilt and installed.

