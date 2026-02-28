# Pin Biome Version Instead of Using "latest"

**Type:** task
**Severity:** low
**Component:** infra
**Reported:** 2026-02-27

## Description

In the root `package.json`, Biome is pinned to `"latest"`:

```json
"@biomejs/biome": "latest"
```

This means every `bun install` (and every CI run) could get a different version of Biome, potentially with different formatting rules, new lints, or breaking changes. This causes:
1. Formatting differences between team members or CI runs
2. Builds that pass locally but fail in CI (or vice versa)
3. Unexpected lint errors after a Biome update

The `biome.json` schema references version `1.9.2` but the installed binary could be any version.

## Expected Behavior

Pin to a specific version range:

```json
"@biomejs/biome": "^1.9.2"
```

Or even better, pin to exact:
```json
"@biomejs/biome": "1.9.2"
```

Update deliberately when new versions are released.

## Implementation Notes

Run `bun add -D @biomejs/biome@^1.9.2` from the repo root. This replaces `"latest"` with a pinned version.

## Resolution

Ran bun add -D @biomejs/biome@1.9.2 to pin to the specific version matching the biome.json schema. Replaced "latest" with "1.9.2" in package.json. Lockfile updated.
