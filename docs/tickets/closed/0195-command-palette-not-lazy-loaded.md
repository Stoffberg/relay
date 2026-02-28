# Command Palette Imported Eagerly in Root Bundle

**Type:** task
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The `CommandPalette` component is statically imported in `__root.tsx` (line 25) even though it's conditionally rendered only when the user presses Cmd+K. This means the component code is included in the root bundle and loaded on every page visit, even though most users never open it.

## Expected Behavior

Lazy-load the command palette:

```typescript
const CommandPalette = React.lazy(() => import('../components/command-palette'));

// In render:
{showCmd && (
    <Suspense fallback={null}>
        <CommandPalette ... />
    </Suspense>
)}
```

## Implementation Notes

The command palette component is small, so the savings are minor. But it's a good practice and this pattern can be applied to other conditionally-rendered components in the future.

## Resolution

Replaced the static import of `CommandPalette` with `React.lazy()` and wrapped it in `<Suspense fallback={null}>`. The command palette code is now split into a separate chunk (`command-palette-*.js`, ~3.2KB) that only loads when the user presses Cmd+K. The main bundle dropped by ~3KB.

