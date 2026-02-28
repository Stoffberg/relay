# LLM Doesn't Know Current Working Directory

**Type:** bug
**Severity:** medium
**Component:** server, agent
**Reported:** 2026-02-27

## Description

When the LLM receives tool access, it has no idea what the user's working directory is. The system prompt doesn't mention it, and there's no mechanism to communicate it. This leads to:

1. The LLM guessing paths or defaulting to absolute paths
2. Extra tool calls wasted on `shell_exec("pwd")` or `list_dir("/Users/...")` to orient itself
3. Incorrect assumptions about project structure

The agent knows its working directory (from config), but this information is never passed to the server or included in the system prompt.

## Expected Behavior

When an agent is online, include the agent's working directory in the system prompt:

```
You have access to the user's machine via an agent running at: /Users/dirk.beukes/Documents/Projects/myapp
```

This gives the LLM immediate context about where to find files.

## Implementation Notes

1. The `agent` table in SpacetimeDB could include a `workdir` field set during registration
2. The server reads the agent's workdir from the subscription cache
3. The system prompt includes it when building the "with agent" prompt

Alternatively, the agent's config already has a working directory concept. Pass it as metadata during `register_agent`.

### Schema change
Add `workdir: Option<String>` to the `Agent` table. Update `register_agent` reducer to accept it.

### Agent change
In `apps/agent/src/main.rs`, pass the current working directory when calling `register_agent`.

### Server change
In the system prompt builder, read the agent's workdir and include it.

## Resolution

Added `workdir: Option<String>` field to the `Agent` table. The agent now passes `std::env::current_dir()` when calling `register_agent`. The server's `run_agent_loop` reads the online agent's workdir and appends it to the system prompt: 'The agent is running in: /path/to/dir'. This gives the LLM immediate context about where to find files.
