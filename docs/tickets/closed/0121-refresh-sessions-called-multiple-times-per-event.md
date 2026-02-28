# refreshSessions Called Multiple Times Per Subscription Event

**Type:** task
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

In `__root.tsx`, the `refreshSessions` callback is invoked on every SpacetimeDB subscription event: `onSubscriptionApplied`, `onSessionInsert`, `onSessionUpdate`, and potentially `onSessionDelete`. A single user action (sending a message) can trigger 3+ subscription updates in rapid succession (session status change, message insert, message part insert), each calling `refreshSessions`.

Each call to `refreshSessions` iterates all sessions from the SpacetimeDB cache, maps them to preview objects, sorts them by `updatedAt`, and sets state. With hundreds of sessions, this is O(n log n) per event, happening 3+ times per message.

## Expected Behavior

Debounce or batch `refreshSessions` so it runs at most once per animation frame:

```typescript
const refreshSessions = useCallback(() => {
    if (refreshPending.current) return;
    refreshPending.current = true;
    requestAnimationFrame(() => {
        refreshPending.current = false;
        const cached = getSessionsFromCache();
        const previews = cached.map(buildSessionPreview);
        previews.sort((a, b) => b.updatedAt - a.updatedAt);
        setSessions(previews);
    });
}, []);
```

## Implementation Notes

A `requestAnimationFrame` debounce naturally coalesces multiple calls within the same frame. This is a minimal change that preserves the existing architecture while eliminating redundant work.

## Resolution

Added `requestAnimationFrame` debouncing to both `refreshSessions` and `refreshAgents` callbacks. A pending ref gates each callback so multiple rapid subscription events within the same frame are coalesced into a single state update. This eliminates the O(n log n) sort running 3+ times per user action.

