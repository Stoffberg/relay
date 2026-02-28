# Fly.toml Has Duplicate Memory Configuration

**Type:** task
**Severity:** low
**Component:** infra
**Reported:** 2026-02-27

## Description

In `apps/server/Fly.toml`, both `memory = '1gb'` and `memory_mb = 1024` are set in the `[[vm]]` section. These are redundant (both specify 1GB). Having both is confusing and could cause issues if someone updates one but not the other.

## Expected Behavior

Use only one memory specification. `memory = '1gb'` is the human-friendly form and is preferred.

## Implementation Notes

Remove `memory_mb = 1024` and keep `memory = '1gb'`.

## Resolution

Removed the duplicate `memory_mb = 1024` line from the `[[vm]]` section in `Fly.toml`, keeping only `memory = '1gb'`. Deployed to Fly.io successfully; both machines healthy.
