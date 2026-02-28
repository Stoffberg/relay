# Grep Tool Schema Requires path Parameter

**Type:** task
**Severity:** low
**Component:** server
**Reported:** 2026-02-27

## Description

The `grep` tool definition sent to the LLM requires both `pattern` and `path` parameters. In practice, most grep operations should default to the current working directory, making `path` optional. Requiring it forces the LLM to always specify a path, which adds verbosity and can lead to incorrect path assumptions.

In `apps/server/src/main.rs` in the `tool_definitions()` function, the grep tool has:

```rust
"required": ["pattern", "path"]
```

## Expected Behavior

Make `path` optional with a default of the current working directory:

```rust
"required": ["pattern"]
```

And in the agent's grep implementation, default to `"."` if path is not provided.

## Resolution

Removed `path` from the `required` array in the grep tool definition sent to the LLM. Updated the agent's execute_tool dispatch to default to the home directory when path is not provided.

