# Sidebar Component Not Memoized

**Type:** task
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The `Sidebar` component in `sidebar.tsx` is not wrapped with `React.memo()`. It receives 8+ props and re-renders on every parent render, including theme toggles, connection status changes, and session list updates. Since the sidebar renders the full session list with per-session buttons and metadata, unnecessary re-renders are wasteful.

## Expected Behavior

Wrap the export with `memo()`:

```typescript
export const Sidebar = memo(function Sidebar({ ... }: SidebarProps) {
    // ...
});
```

This skips re-renders when props haven't changed, which is most of the time (connection status and theme don't change often).

## Implementation Notes

Simple change. Ensure all callback props passed to Sidebar are wrapped with `useCallback` in the parent (they appear to be already). The `sessions` array reference should be stable between renders unless sessions actually change.

## Resolution

Wrapped the Sidebar component export with `React.memo()`. Prevents unnecessary re-renders when props haven't changed (which is most renders since connection state and theme change infrequently).

