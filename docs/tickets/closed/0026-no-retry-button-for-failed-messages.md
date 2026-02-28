# No Retry Button When Message Send Fails

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-26

## Description

In `apps/web/src/routes/chat.$sessionId.tsx`, when the POST to `/chat` fails (network error, 429, 500, etc.), the optimistic message is replaced with an error message in the chat. But the original message text is lost and there's no retry button.

The user has to retype their entire message and send again. For long, carefully written messages this is painful.

## Expected Behavior

When a send fails:
1. Keep the original user message visible (marked as "failed")
2. Show a "Retry" button next to it
3. Clicking retry re-sends the exact same message
4. If the user edits the input bar and sends a new message, the failed message should be dismissed

## Implementation Notes

In `chat-store.ts`, when `addErrorMessage` is called, also store the original message text. In `message-row.tsx`, render a retry button for messages with status "error" that have an `originalText` field.

The retry button should call the same `sendMessage` function from the chat route with the stored text.

## Resolution

Added `retryText` field to `ChatMessage` and `removeMessage()` method to `ChatSessionStore`. All three error paths in `doSend` now store the original text in the error message. Error messages render a "Retry" button that dispatches a `relay:retry` CustomEvent. Chat page listens for the event, removes the error message, and resends via `doSend`.
