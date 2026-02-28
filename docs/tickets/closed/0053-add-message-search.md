# Add Message Search Within Conversations

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

There's no way to search within a conversation. If a user has a long chat with 100+ messages and wants to find where they discussed a specific topic, they have to scroll through everything manually.

The command palette searches session titles but not message content.

## Expected Behavior

Add Cmd/Ctrl+F style search within the active conversation:

1. Opens a search bar at the top of the chat area
2. Searches message content in real time
3. Highlights matching text in messages
4. Shows match count ("3 of 12 matches")
5. Up/Down arrows or Enter/Shift+Enter to jump between matches
6. Escape to close search

## Implementation Notes

Since all message data is already in the SpacetimeDB subscription cache, search can be entirely client side with no API calls.

1. Add a search state to the chat route
2. Filter messages by content match
3. Use the virtualizer's `scrollToIndex` to jump to matching messages
4. Highlight matches using a simple text highlight component (split text at match boundaries, wrap matches in `<mark>`)

The command palette could also gain a "Search messages" command that opens this search bar.

## Resolution

Added Cmd/Ctrl+F in-conversation message search. Opens a search bar between the header and message list. Searches all messages client-side in real time with match count display ("2/5"). Enter/Shift+Enter jumps between matches using virtualizer.scrollToIndex. Escape closes search. Uses `useMemo` for match computation.
