# Conditional Hooks Violation in Chat Route

**Type:** bug
**Severity:** critical
**Component:** web
**Reported:** 2026-02-27

## Description

The `chat.$sessionId.tsx` route component has an early return for invalid session IDs (line ~36) that happens before several React hooks (`useRef`, `useSyncExternalStore`, `useEffect`, `useVirtualizer`, `useCallback`). This violates React's rules of hooks, which require hooks to be called in the same order on every render.

If the component renders with a valid sessionId then re-renders with an invalid one (or vice versa), React will throw an error because the number of hooks changed between renders.

## Steps to Reproduce

1. Navigate to a valid chat session
2. Manually change the URL to a session ID with invalid characters (e.g., `/chat/!!!`)
3. React throws a hooks order violation error

## Expected Behavior

The invalid session ID check should happen after all hooks are declared, or the hooks should be called unconditionally with the validation affecting their behavior rather than preventing their execution.

## Implementation Notes

Move the `SESSION_ID_RE.test(sessionId)` check below all hook declarations. Use the validation result to conditionally render the error UI in the return statement, not as an early return before hooks.

```tsx
const isValid = SESSION_ID_RE.test(sessionId);
const scrollRef = useRef<HTMLDivElement>(null);
// ... all other hooks ...
if (!isValid) return <div>Invalid session ID</div>;
```

## Resolution

Moved the `SESSION_ID_RE.test(sessionId)` check below all hook declarations. The validation result is stored in an `isValidSession` variable at the top, all hooks are called unconditionally, then the invalid session UI is rendered as a conditional return after the hooks. This ensures hooks are always called in the same order regardless of session ID validity.
