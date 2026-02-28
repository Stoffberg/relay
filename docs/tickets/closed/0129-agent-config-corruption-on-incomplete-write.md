# Agent Config File Can Be Corrupted on Incomplete Write

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

The agent config is saved using `std::fs::write()` which is not atomic. If the process is killed or crashes during `save_config()`, the config file at `~/.config/relay/config.toml` can be left in a partially-written state. On next startup, `load_config()` silently returns `None` (indistinguishable from "no config found"), and the user is told to run `relay setup` again even though they already configured the agent.

In `apps/agent/src/main.rs` around lines 93-97:

```rust
fn save_config(config: &AgentConfig) -> Result<()> {
    let path = config_path();
    let content = toml::to_string_pretty(config)?;
    std::fs::write(&path, content)?;
    Ok(())
}
```

And the silent parse failure at line 90:

```rust
toml::from_str(&content).ok()
```

## Expected Behavior

Use atomic write (write to temp file, then rename):

```rust
let tmp = path.with_extension("toml.tmp");
std::fs::write(&tmp, content)?;
std::fs::rename(&tmp, &path)?;
```

Also, if config parsing fails, log the actual error instead of silently returning `None`.

## Resolution

Changed `save_config` to use atomic write: writes to `config.toml.tmp` then renames to `config.toml`. Also updated `load_config` to log the actual parse error instead of silently returning `None`, so users see a clear warning when their config file is malformed.

