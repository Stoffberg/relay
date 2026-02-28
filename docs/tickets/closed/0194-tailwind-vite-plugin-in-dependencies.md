# Build-Only Dependencies Listed in dependencies Instead of devDependencies

**Type:** task
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

`@tailwindcss/vite` and `tailwindcss` are listed in `dependencies` in `apps/web/package.json` but they are only used at build time (in `vite.config.ts`). They never appear in application code and should be in `devDependencies`.

In `apps/web/package.json` lines 13 and 25.

This doesn't affect the client bundle (Vite won't include build plugins), but it means these packages get installed in production environments if someone runs `bun install --production`, wasting disk space and install time.

## Expected Behavior

Move both to `devDependencies`:

```bash
bun remove @tailwindcss/vite tailwindcss
bun add -D @tailwindcss/vite tailwindcss
```

## Resolution

Moved `@tailwindcss/vite` and `tailwindcss` from `dependencies` to `devDependencies` using `bun remove` followed by `bun add -D`.

