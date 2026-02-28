# Add Session Error Recovery Action

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

When a session enters "error" status (visible as a red indicator in the sidebar), there's no way for the user to clear the error or retry. The session is stuck. The server's `run_session_queue` may have failed, but the client has no mechanism to kick it back into processing.

This is distinct from ticket 0026 (retry button for individual failed messages). This covers the session-level error state where the entire session is broken.

## Expected Behavior

1. Show an error banner at the top of the chat when the session status is "error"
2. Include a "Retry" button that sends a request to the server to reset the session status to "idle" and re-process any queued messages
3. Or add a "Clear Error" action that sets the session back to "idle" so the user can continue chatting

## Implementation Notes

This needs a server endpoint or reducer call to reset session status. The `update_session_status` reducer exists but the frontend currently never calls reducers directly (all writes go through the HTTP API). Either add a `/session/{id}/reset` endpoint or have the frontend call the reducer directly via SpacetimeDB.

## Resolution

Added an error banner at the top of the chat area when `sessionStatus === "error"`. Banner shows "Session encountered an error" with a "Reset" button that calls `conn.reducers.updateSessionStatus(sessionId, "idle")`. The banner uses `bg-danger-soft` styling with `border-danger/20`.

