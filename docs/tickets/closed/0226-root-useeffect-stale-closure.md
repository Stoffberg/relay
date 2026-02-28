# Root Component useEffect Has Stale Closure Over startNewChat

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

In `__root.tsx`, the keyboard shortcut `useEffect` (handling Escape and Cmd+N) captures `startNewChat` and `showCmd` in its closure. The `showCmd` state is in the dependency array, causing the listener to re-register on every command palette toggle. The `startNewChat` function references `navigate` but isn't wrapped in `useCallback` and isn't in the dependency array, so it could close over a stale `navigate` reference.

The re-registration on every `showCmd` change is also unnecessary churn. The Escape handler checks `showCmd` inside the closure, but this could be done with a ref to avoid the dependency.

## Expected Behavior

The keyboard shortcut listener should be registered once and use refs for values that change frequently (like `showCmd`). `startNewChat` should be wrapped in `useCallback` with `navigate` as a dependency.

## Implementation Notes

```tsx
const showCmdRef = useRef(showCmd);
showCmdRef.current = showCmd;

const startNewChat = useCallback(() => {
  navigate({ to: "/chat/$sessionId", params: { sessionId: crypto.randomUUID() } });
}, [navigate]);

useEffect(() => {
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && showCmdRef.current) setShowCmd(false);
    // ...
  }
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [startNewChat]); // stable dependency
```

## Resolution

Used a `useRef` for `showCmd` and wrapped `startNewChat` in `useCallback` with `navigate` as a dependency. The keyboard shortcut listener now registers once (stable dependency on `startNewChat`) and reads `showCmdRef.current` instead of closing over stale state. Deployed to Cloudflare Workers.
