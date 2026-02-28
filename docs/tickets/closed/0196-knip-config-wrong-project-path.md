# Knip Config Project Path May Not Match Monorepo Structure

**Type:** bug
**Severity:** low
**Component:** infra
**Reported:** 2026-02-27

## Description

The root `knip.json` configuration has `"project": ["src/**/*.{ts,tsx}"]` which looks for source files in a root-level `src/` directory. In this monorepo, the web app sources are at `apps/web/src/`, not `src/`. This means knip may not be scanning the web app for dead code at all.

In `relay/knip.json` line 3:
```json
"project": ["src/**/*.{ts,tsx}"]
```

The root `package.json` runs knip via `bunx knip --exclude exports,types` but without workspace-aware configuration, it may only scan the root level.

## Expected Behavior

Either configure knip with workspace awareness:

```json
{
    "workspaces": {
        "apps/web": {
            "project": ["src/**/*.{ts,tsx}"]
        }
    }
}
```

Or update the project paths to match the monorepo layout. Verify by running `bun run knip` and checking if it reports findings from `apps/web/src/`.

## Resolution

Replaced the flat `project` config in `knip.json` with a `workspaces` configuration that properly targets `apps/web/src/**` and `packages/infra/**`. Added `src/module_bindings/**` to the web workspace's ignore list since those are generated files.

