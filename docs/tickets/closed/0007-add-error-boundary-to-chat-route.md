# Add Error Boundary to Chat Route

**Type:** bug
**Severity:** high
**Component:** web
**Reported:** 2026-02-26

## Description

Neither `__root.tsx` nor `chat.$sessionId.tsx` have React error boundaries. If any component inside the chat page throws during render (bad markdown content, malformed tool call data, SpacetimeDB data type mismatch), the entire app crashes with a white screen and no recovery path.

This is especially likely during streaming, when partial data arrives and components try to render incomplete state.

## Expected Behavior

Wrap the chat route in an error boundary that:
1. Catches render errors
2. Shows a friendly error message with a "reload" button
3. Logs the error for debugging
4. Doesn't crash the sidebar or navigation (so the user can switch to a different session)

## Implementation Notes

TanStack Router supports `errorComponent` on route definitions. In `apps/web/src/routes/chat.$sessionId.tsx`, add an error component to the route:

```tsx
export const Route = createFileRoute('/chat/$sessionId')({
  component: ChatPage,
  errorComponent: ({ error }) => (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <p className="text-lg font-medium">Something went wrong</p>
        <p className="text-muted text-sm mt-2">{error.message}</p>
        <button onClick={() => window.location.reload()} className="mt-4 ...">
          Reload
        </button>
      </div>
    </div>
  ),
})
```

This keeps the sidebar functional while only the chat area shows the error.

## Resolution

Added errorComponent to the TanStack Router route definition for chat.$sessionId. Shows 'Something went wrong' with the error message and a Reload button. The sidebar stays functional so the user can switch sessions without a full page reload.
