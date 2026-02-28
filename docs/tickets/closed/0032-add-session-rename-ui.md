# Add Session Rename UI

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-26

## Description

Sessions get auto-titled from the first message (first 77 characters), but there's no way to rename a session in the UI. The `update_session_title` reducer exists in SpacetimeDB but the frontend never calls it.

Users can't organize their conversations with meaningful names. A conversation titled "Hey can you help me with..." isn't useful when scanning the sidebar.

## Expected Behavior

1. Double-click on a session title in the sidebar to enter edit mode
2. An inline text input appears where the title was
3. Press Enter to save, Escape to cancel
4. The `update_session_title` reducer is called via SpacetimeDB SDK
5. Title updates in real time for all connected clients

## Implementation Notes

In `apps/web/src/components/sidebar.tsx`:

1. Add an `editingSessionId` state
2. On double-click of a session row, set `editingSessionId` to that session's ID
3. Render an `<input>` instead of the title text when editing
4. On Enter: call `connection.reducers.updateSessionTitle(sessionId, newTitle)`
5. On Escape or blur: cancel editing
6. Add a pencil icon that appears on hover as an alternative trigger

Keep it simple. No modal, no separate form. Inline editing is the cleanest UX for this.

## Resolution

Double-clicking a session title in the sidebar switches to an inline `<input>` for editing. Enter saves via `conn.reducers.updateSessionTitle()`, Escape or blur cancels. Added `editingId`, `editText`, and `editRef` state. Input auto-selects text on edit start. Title updates in real time for all connected clients.
