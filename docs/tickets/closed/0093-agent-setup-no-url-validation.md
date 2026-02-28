# Agent Setup Doesn't Validate Input

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

The `relay setup` command accepts any string for the SpacetimeDB URL, database name, and agent name without validation. A user could enter:
1. An invalid URL like "not-a-url" for spacetime_url
2. An empty string for the database name
3. An agent name with special characters that breaks SpacetimeDB

The invalid config is saved and the agent will fail to connect on start, with a cryptic connection error rather than a clear "invalid URL" message.

## Expected Behavior

Validate inputs during setup:
1. `spacetime_url`: Must be a valid WebSocket URL (starts with `ws://` or `wss://`)
2. `spacetime_db`: Must not be empty, alphanumeric with hyphens/underscores only
3. `agent_name`: Must not be empty, reasonable length (< 100 chars)

Show validation errors inline and re-prompt if invalid.

## Implementation Notes

In `apps/agent/src/main.rs` in the `run_setup` function, add validation after each prompt:

```rust
let spacetime_url: String = Input::new()
    .with_prompt("SpacetimeDB URL")
    .with_initial_text(&config.spacetime_url)
    .validate_with(|input: &String| -> Result<(), String> {
        if input.starts_with("ws://") || input.starts_with("wss://") {
            Ok(())
        } else {
            Err("URL must start with ws:// or wss://".to_string())
        }
    })
    .interact_text()?;
```

The `dialoguer` crate already supports `.validate_with()` on `Input`, so this is a small change.

## Resolution

Added validate_with() to all three dialoguer::Input prompts in run_setup. spacetime_url must start with ws://, wss://, http://, or https://. spacetime_db must be non-empty and alphanumeric with hyphens/underscores. agent_name must be non-empty and under 100 chars. Invalid input shows the error and re-prompts. Agent rebuilt and installed.
