# CI Does Not Pin Bun Version

**Type:** bug
**Severity:** low
**Component:** infra
**Reported:** 2026-02-27

## Description

The CI pipeline uses `oven-sh/setup-bun@v1` without specifying a `bun-version` input, so it installs the latest version. The project's `package.json` specifies `"packageManager": "bun@1.3.9"`, but CI doesn't enforce this.

A new bun release with breaking changes could cause CI failures unrelated to code changes, or worse, silently change build behavior.

## Expected Behavior

Pin the bun version in CI to match the project's `packageManager` field.

## Implementation Notes

```yaml
- uses: oven-sh/setup-bun@v1
  with:
    bun-version: "1.3.9"
```

## Resolution

Added `bun-version: "1.3.9"` to all three `oven-sh/setup-bun@v1` steps in `ci.yml` (lint, typecheck, build jobs). Matches the `packageManager` field in `package.json`.
