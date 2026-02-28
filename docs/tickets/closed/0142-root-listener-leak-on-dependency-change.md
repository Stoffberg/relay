# Root Component Listener Leak on useEffect Dependency Change

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

In `__root.tsx`, the `useEffect` that registers SpacetimeDB listeners includes `refreshSessions` and `refreshAgents` in its dependency array. These are defined with `useCallback`, meaning if their dependencies change, the callbacks are recreated, the effect re-runs, and a new listener is added to the `listeners` Set.

The cleanup function in the effect calls `remove()` (which deletes the old listener) and then `disconnect()`. But `disconnect()` tears down the entire SpacetimeDB connection, which is too aggressive for a listener re-registration.

More critically: if React batches or interrupts renders (Concurrent Mode), the cleanup may not run synchronously before the new effect fires, causing a brief period with two active listeners.

In `__root.tsx` around lines 94-112:

```typescript
useEffect(() => {
    const conn = connectToSpacetime();
    const remove = addListener({
        // ... 7 callbacks
    });
    return () => { remove(); disconnect(); };
}, [refreshSessions, refreshAgents, ...]);
```

## Expected Behavior

The listener effect should have a stable dependency array. `refreshSessions` and `refreshAgents` should use `useRef` patterns to avoid being in the dependency array, or the effect should not include them as dependencies.

## Implementation Notes

Use a ref to hold the latest callback:

```typescript
const refreshSessionsRef = useRef(refreshSessions);
refreshSessionsRef.current = refreshSessions;

useEffect(() => {
    const remove = addListener({
        onSessionInsert: () => refreshSessionsRef.current(),
        // ...
    });
    return () => remove();
}, []); // stable, runs once
```

## Resolution

The `refreshSessions` and `refreshAgents` callbacks already use `useCallback` with empty `[]` dependency arrays, making them referentially stable. The useEffect dependency array `[refreshSessions, refreshAgents]` is therefore stable and never causes re-registration. Combined with the rAF debounce (ticket 0121), the listener pattern is now safe against concurrent mode edge cases.

