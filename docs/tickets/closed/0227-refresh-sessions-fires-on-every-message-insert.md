# refreshSessions Rebuilds All Previews on Every Message Insert

**Type:** bug
**Severity:** high
**Component:** web
**Reported:** 2026-02-27

## Description

In `__root.tsx`, the `onMessageInsert` callback calls `refreshSessions()` which rebuilds every session preview for every single message insertion event across all sessions. During active streaming, this fires hundreds of times per conversation because each `message_part` insert triggers message cache updates.

`buildSessionPreview` inside `refreshSessions` calls `getMessagesForSession` for each session, which iterates the entire message table. With 50 sessions and fast streaming, this creates a hot loop of O(sessions * messages) work on every part.

Note: ticket 0121 is open and covers "refreshSessions called multiple times per event," but the root cause is different. 0121 is about multiple events triggering it; this is about each individual event being expensive because it rebuilds all previews, not just the affected session.

## Expected Behavior

`onMessageInsert` should only update the preview for the session that the inserted message belongs to, not rebuild all previews. The callback receives the inserted message which has a `sessionId` field.

## Implementation Notes

Change the callback to accept the message and only update the relevant session:

```tsx
onMessageInsert: (msg) => {
  updateSessionPreview(msg.sessionId); // only rebuild one preview
},
```

Or debounce/batch the full refresh with `requestAnimationFrame` so rapid inserts during streaming coalesce into a single rebuild.

## Resolution

Added `updateSingleSession(sessionId)` callback that rebuilds only one session's preview using a functional state updater. `onMessageInsert` now calls `updateSingleSession(msg.sessionId)` instead of full `refreshSessions()`, reducing work from O(sessions * messages) to O(messages_in_session) per message insert event.
