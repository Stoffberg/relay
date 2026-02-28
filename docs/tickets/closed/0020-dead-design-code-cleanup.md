# Remove Dead Design Code and Unused Preview Routes

**Type:** task
**Severity:** low
**Component:** web
**Reported:** 2026-02-26

## Description

The frontend has several files that are dead code or only used by preview/demo routes that aren't part of the production app:

1. `apps/web/src/lib/design-theme.ts` (80 lines): Defines a complete theme system with 26 color tokens. **Not imported anywhere** in the main app. The actual theme lives in `styles.css` CSS variables. The token names don't even match (`textSecondary` vs `--muted`).

2. `apps/web/src/lib/design-data.ts` (155 lines): Contains seed conversation data (`SEED_CONVOS`, `PROJECTS` arrays) and a `statusDot()` function with hardcoded hex colors. Only imported by preview routes 1-5.

3. `apps/web/src/lib/design-logic.ts` (289 lines): Contains `useRelayState` hook for demo state management. Only imported by preview routes 1-5.

4. `apps/web/src/routes/1.tsx` through `5.tsx`: Preview/demo routes with their own inline color palettes that duplicate and conflict with the theme system. Each route defines its own `pal` object with hardcoded colors.

Total: ~770 lines of dead or demo-only code.

## Expected Behavior

Either:
1. **Remove all dead code**: Delete `design-theme.ts`, `design-data.ts`, `design-logic.ts`, and routes 1-5. They add complexity, increase bundle size, and create confusion about which theme system is canonical.
2. **Move to a separate directory**: If the preview routes are still valuable for design iteration, move them to a `_preview/` directory that's excluded from production builds.

## Implementation Notes

Run `bun run build` after deletion to verify nothing breaks. Check that no production code imports from these files (the explore confirmed only routes 1-5 use them).

The `statusDot()` function in `design-data.ts` should be migrated to use CSS variables if it's actually needed anywhere in production code. Currently it returns hardcoded hex values that don't respect dark/light mode.

## Resolution

Deleted design-data.ts (155 lines), design-logic.ts (289 lines), design-theme.ts (80 lines), and routes 1.tsx through 5.tsx. Total ~770 lines removed. CSS bundle dropped from 28.84 KB to 20.93 KB. Build verified clean with no broken imports.
