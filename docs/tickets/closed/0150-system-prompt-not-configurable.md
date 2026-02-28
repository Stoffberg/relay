# System Prompt Hardcoded in Server Binary

**Type:** task
**Severity:** low
**Component:** server
**Reported:** 2026-02-27

## Description

The system prompt sent to the LLM is hardcoded as a Rust string literal in `run_agent_loop` (lines 868-889 of `main.rs`). Changing the prompt requires recompiling and redeploying the server binary.

There are two prompt variants (with and without agent), each ~15 lines. They're well-written and functional, but modifying them requires a full deploy cycle.

## Expected Behavior

Load the system prompt from an environment variable or a configuration file. This allows prompt iteration without redeployment:

```rust
let system_prompt = std::env::var("SYSTEM_PROMPT")
    .unwrap_or_else(|_| default_system_prompt(has_agent).to_string());
```

## Implementation Notes

This relates to ticket 0064 (per-session system prompt customization) but is distinct: that ticket is about user-facing customization, while this is about operator-level configurability. Both can coexist (operator sets the base prompt, user can optionally customize per session).

For the two-variant approach (with/without agent), could use `SYSTEM_PROMPT_WITH_AGENT` and `SYSTEM_PROMPT_NO_AGENT` env vars with fallback to the current hardcoded defaults.

## Resolution

System prompts now load from `SYSTEM_PROMPT_WITH_AGENT` and `SYSTEM_PROMPT_NO_AGENT` env vars, falling back to the existing hardcoded defaults when not set. Allows prompt iteration without redeployment.

