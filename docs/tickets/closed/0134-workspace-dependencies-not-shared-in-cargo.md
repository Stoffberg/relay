# Workspace Dependencies Not Shared in Cargo.toml

**Type:** task
**Severity:** low
**Component:** infra
**Reported:** 2026-02-27

## Description

The Cargo workspace root at `relay/Cargo.toml` has an empty `[workspace.dependencies]` section. Each crate (server, agent, spacetime) declares its own dependency versions independently. This means:

1. `tokio`, `serde`, `anyhow`, `tracing` versions can drift between crates
2. Upgrading a shared dependency requires editing 3 separate Cargo.toml files
3. No guarantee that all crates use the same version of `spacetimedb-sdk`

## Expected Behavior

Declare shared dependencies at the workspace level:

```toml
[workspace.dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
anyhow = "1"
tracing = "0.1"
spacetimedb-sdk = "2.0.1"
```

Then in each crate:

```toml
[dependencies]
tokio = { workspace = true }
```

## Implementation Notes

This is a one-time refactor. Check `apps/server/Cargo.toml`, `apps/agent/Cargo.toml`, and `packages/spacetime/Cargo.toml` for all shared dependencies. Move common ones to workspace level. Keep crate-specific dependencies (like `axum` for server only) in the individual Cargo.toml files.

## Resolution

Moved 8 shared dependencies to `[workspace.dependencies]` in root Cargo.toml: tokio, serde, serde_json, anyhow, tracing, tracing-subscriber, spacetimedb-sdk, uuid. Updated all three crate Cargo.toml files to use `{ workspace = true }`. Crate-specific dependencies (axum, tower-http, reqwest, etc.) remain local. Verified with `cargo check --workspace`.

