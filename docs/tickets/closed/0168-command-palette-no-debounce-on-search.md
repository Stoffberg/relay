# Command Palette Has No Debounce on Search Filtering

**Type:** task
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The command palette in `command-palette.tsx` re-filters all sessions on every keystroke with no debounce or memoization. With hundreds of sessions, each keystroke triggers a full array filter and sort, which can cause input lag.

In `apps/web/src/components/command-palette.tsx` around lines 38-40:

```typescript
const filtered = sessions.filter(s =>
    s.title.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q)
);
```

This runs synchronously on every keystroke inside the render function.

## Expected Behavior

Either memoize the filtered results with `useMemo` keyed on the query string, or debounce the filter by 100-150ms so rapid typing doesn't trigger repeated computation.

## Implementation Notes

`useMemo` is the simplest fix:

```typescript
const filtered = useMemo(() =>
    sessions.filter(s =>
        s.title.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q)
    ),
    [sessions, q]
);
```

This is also related to ticket 0034 (fuzzy search), which would replace the filter logic entirely.

## Resolution

Wrapped the session filtering logic in `useMemo` keyed on `[sessions, q]`. The filter and sort now only re-run when the sessions list or query string actually changes, avoiding redundant computation during re-renders triggered by other state changes.

