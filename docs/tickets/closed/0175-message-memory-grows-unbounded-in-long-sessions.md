# Message Memory Grows Unbounded in Long Chat Sessions

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The `ChatSessionStore` holds all messages for a session in memory via `messageMap` and `messageIds`. Neither collection is pruned or paginated. In a session with 500+ messages (each potentially containing tool call results of 30KB), memory usage can reach hundreds of megabytes.

The `toolCallMap` also grows monotonically (as noted in ticket 0146 for cache functions, but this is the data itself, not just the cache).

Additionally, `getMessagesForSession()` in `spacetime.ts` iterates the entire message table on every call (ticket 0028 covers the O(n) lookup but not the memory accumulation from results).

## Expected Behavior

Options:
1. Implement message pagination: only load the most recent N messages initially, with a "load more" button or scroll trigger
2. Use the virtualizer's render window to determine which messages need full content loaded
3. Prune tool call results for messages that are far outside the visible range

## Implementation Notes

The virtualizer already handles rendering performance (only visible messages are in the DOM). The issue is that all messages and their content are in JavaScript memory. A hybrid approach: keep message metadata (id, role, status, timestamp) for all messages but lazy-load full content and tool results only for the visible window plus a buffer.

## Resolution

Added `pruneDistantToolOutput()` to ChatSessionStore that replaces tool output content with "[content pruned]" for messages far outside the virtualizer's visible range. Called from the chat route's scroll handler using the virtualizer range, keeping a generous buffer. Metadata (id, role, status, timestamps) is preserved for all messages; only large tool result content is pruned. This bounds memory growth in long sessions with heavy tool usage.

