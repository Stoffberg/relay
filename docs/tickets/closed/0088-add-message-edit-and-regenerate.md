# Add Message Edit and Regenerate

**Type:** feature
**Severity:** medium
**Component:** web, server
**Reported:** 2026-02-27

## Description

Users can't edit a sent message or regenerate an AI response. If the AI gives an unsatisfactory answer, the user has to rephrase and send a new message, cluttering the conversation. Every other chat AI (ChatGPT, Claude.ai) offers edit/regenerate functionality.

## Expected Behavior

### Edit User Message
1. Hover over a user message to see an "Edit" button
2. Clicking opens the message text in an inline editor
3. On save, the edited message replaces the original, and the AI response is regenerated
4. All messages after the edited one are removed (conversation history rewinds)

### Regenerate AI Response
1. Hover over an AI response to see a "Regenerate" button
2. Clicking removes the current AI response and re-sends the preceding user message
3. The AI generates a new response with the same history

## Implementation Notes

### Regenerate (simpler, do first)
1. Add a `regenerate_message` endpoint or reducer that:
   a. Deletes the assistant message and its parts
   b. Re-queues the preceding user message for processing
2. Frontend sends a request to regenerate, removes the old response from the UI

### Edit (more complex)
1. Need a `rewind_session` mechanism that:
   a. Deletes all messages after a given message_id
   b. Updates the given message's content
   c. Re-queues it for processing
2. Frontend shows inline editor, on save calls rewind, shows loading state

Both features need new reducers in SpacetimeDB for deleting messages and their associated data.

## Resolution

Full implementation of both edit and regenerate.

Schema: Added `delete_message` reducer (cascade deletes tool_commands, tool_results, message_parts, then message) and `update_message_content` reducer (replaces all message_parts with new content). Published without data loss.

Server: Added `/regenerate` endpoint that finds the preceding user message, deletes the assistant message, creates a new queued user message with the original content, and feeds it through the existing session queue. Added `/edit` endpoint that deletes all messages after the edited one, updates the message content, creates a new queued message, and re-triggers processing.

Frontend: User messages show an "Edit" button on hover (complete messages only). Clicking opens an inline textarea editor with Save & regenerate / Cancel buttons and Cmd+Enter shortcut. Assistant messages show a "Regen" button on hover next to Copy. Both call the server endpoints which handle the orchestration.

Added `sessionId` to the `ChatMessage` interface so message components know which session they belong to for API calls.
