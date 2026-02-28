# Chat Fetch Has No AbortController for Navigation Cleanup

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The `sendMessage` function in `chat.$sessionId.tsx` calls `fetch()` without an `AbortController`. If the user navigates to a different session while a fetch is in-flight, the request continues in the background. The fetch callback captures the old `sessionId` and `store` from the closure, so when it resolves, it may interact with a destroyed store or send a message to the wrong session.

In `apps/web/src/routes/chat.$sessionId.tsx` around lines 94-127:

```typescript
const res = await fetch(`${API_URL}/chat`, { ... });
```

No `signal` parameter, no abort mechanism.

## Steps to Reproduce

1. Send a message in session A
2. Immediately navigate to session B before the response arrives
3. The fetch for session A completes in the background
4. The optimistic message in session A's store may update incorrectly

## Expected Behavior

Use `AbortController` and abort pending requests on session change or component unmount:

```typescript
const controllerRef = useRef<AbortController>();

useEffect(() => {
    return () => controllerRef.current?.abort();
}, [sessionId]);

// In sendMessage:
controllerRef.current?.abort();
controllerRef.current = new AbortController();
const res = await fetch(url, { signal: controllerRef.current.signal, ... });
```

## Resolution

Added an `AbortController` ref to the chat page component. Each fetch creates a new controller and passes its signal. On session change or component unmount, any in-flight fetch is aborted. AbortError is caught and silently ignored (no error message shown for navigated-away requests).

