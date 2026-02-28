# Add Conversation Branching (Fork from Message)

**Type:** feature
**Severity:** low
**Component:** web, server
**Reported:** 2026-02-27

## Description

Sometimes a conversation goes in the wrong direction after a certain point. Users should be able to "fork" from any message, creating a new session that starts with the conversation history up to that point.

This is similar to ChatGPT's "edit and regenerate" feature but more flexible: it creates a whole new branch instead of overwriting.

## Expected Behavior

1. Hover over any message to see a "Fork from here" button
2. Clicking it creates a new session with all messages up to (and including) the selected message copied over
3. The new session opens in the chat area
4. The original session is unchanged

## Implementation Notes

### Schema
Add a `parent_message_id: Option<String>` field to the `Session` table to track where the fork originated. This is metadata only, for display purposes.

### Server
Add a `fork_session` reducer that:
1. Creates a new session
2. Copies all messages from the source session up to the specified message_id
3. Copies the associated message_parts
4. Returns the new session_id

### Frontend
1. Add a fork button on hover for each message in `message-row.tsx`
2. On click, call the fork reducer
3. Navigate to the new session

This is a nice-to-have power user feature. Low priority but high value for coding conversations where you want to try different approaches.

## Resolution

_(fill in when resolving)_
