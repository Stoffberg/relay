# Agent Config Has No Environment Variable Overrides

**Type:** feature
**Severity:** low
**Component:** agent
**Reported:** 2026-02-27

## Description

Agent configuration is file-only (`~/.config/relay/config.toml`). There's no way to override config values via environment variables. This makes it harder to:
1. Run the agent in Docker containers (env vars are the standard config mechanism)
2. Temporarily override settings without editing the config file
3. Use the agent in CI/CD pipelines
4. Configure different settings per-shell-session

## Expected Behavior

Support environment variable overrides with the prefix `RELAY_`:
1. `RELAY_SPACETIME_URL` overrides `spacetime_url` from config
2. `RELAY_SPACETIME_DB` overrides `spacetime_db` from config
3. `RELAY_AGENT_NAME` overrides `agent_name` from config

Environment variables take precedence over the config file. The config file is still the primary config mechanism for normal use.

## Implementation Notes

After loading config in `apps/agent/src/main.rs`:

```rust
let mut config = load_config().unwrap_or_default();
if let Ok(url) = std::env::var("RELAY_SPACETIME_URL") {
    config.spacetime_url = url;
}
if let Ok(db) = std::env::var("RELAY_SPACETIME_DB") {
    config.spacetime_db = db;
}
if let Ok(name) = std::env::var("RELAY_AGENT_NAME") {
    config.agent_name = name;
}
```

Or use a crate like `config-rs` that merges multiple config sources automatically.

## Resolution

Added env var overrides after config file loading in the `Run` command path. `RELAY_SPACETIME_URL`, `RELAY_SPACETIME_DB`, and `RELAY_AGENT_NAME` override their respective config file values when set. Environment variables take precedence over the config file.
