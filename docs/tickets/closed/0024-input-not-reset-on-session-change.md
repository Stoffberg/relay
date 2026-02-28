# Input Text Not Reset When Switching Sessions

**Type:** bug
**Severity:** high
**Component:** web
**Reported:** 2026-02-26

## Description

In `apps/web/src/routes/chat.$sessionId.tsx`, the `input` state is declared via `useState("")` at the route component level. When the user navigates between sessions, the input text persists because React doesn't remount the component (same route, different param).

The textarea in `input-bar.tsx` has `key={sessionId}` which resets focus, but the parent's `input` state is not keyed to the session. So if you type "hello" in session A, then click session B in the sidebar, "hello" is still in the input bar.

## Steps to Reproduce

1. Open session A in the chat
2. Type something in the input bar but don't send
3. Click a different session in the sidebar
4. The input bar still shows the text from session A

## Expected Behavior

Input should clear when switching sessions. Two approaches:

1. Add `key={sessionId}` to the parent component or use `useEffect` to reset input when `sessionId` changes
2. Store draft input per session in a Map so users can resume typing when they come back

Option 1 is simpler. Option 2 is better UX.

## Implementation Notes

Quick fix in `chat.$sessionId.tsx`:

```tsx
useEffect(() => {
  setInput("");
}, [sessionId]);
```

Or for draft persistence:
```tsx
const drafts = useRef(new Map<string, string>());
useEffect(() => {
  drafts.current.set(prevSessionId, input);
  setInput(drafts.current.get(sessionId) ?? "");
}, [sessionId]);
```

## Resolution

Added useEffect in ChatPage that calls setInput('') when sessionId changes. Simple and effective since draft persistence isn't needed for this single-user app.
