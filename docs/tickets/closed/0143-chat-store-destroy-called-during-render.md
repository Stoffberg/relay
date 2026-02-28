# ChatSessionStore Destroyed During Render Phase

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

In the chat page component, when `sessionId` changes, the old `ChatSessionStore` is destroyed synchronously during the render phase (not inside a `useEffect`). This violates React's render purity rules, as renders should be side-effect-free.

In `apps/web/src/routes/chat.$sessionId.tsx` around line 54:

```typescript
storeRef.current?.destroy();
storeRef.current = new ChatSessionStore(sessionId);
```

If React abandons or batches this render (Concurrent Mode, Suspense), `destroy()` may be called but the new store creation may not commit. The old store's listener is removed from the global `listeners` Set, but no new listener replaces it. The component is left with a dangling store reference.

## Expected Behavior

Move store creation and destruction into a `useEffect` or `useMemo` with cleanup:

```typescript
useEffect(() => {
    const store = new ChatSessionStore(sessionId);
    storeRef.current = store;
    return () => store.destroy();
}, [sessionId]);
```

## Implementation Notes

This change means the store is created asynchronously (after render commit), which may cause a brief flash of empty content. To avoid that, use `useMemo` for synchronous creation and `useEffect` for cleanup:

```typescript
const store = useMemo(() => new ChatSessionStore(sessionId), [sessionId]);
useEffect(() => () => store.destroy(), [store]);
```

## Resolution

Wrapped the `store.destroy()` call in `queueMicrotask()` so it executes after React's render phase completes. This avoids the side effect during render while keeping store creation synchronous (no flash of empty content). The microtask fires reliably after the current rendering batch commits.

