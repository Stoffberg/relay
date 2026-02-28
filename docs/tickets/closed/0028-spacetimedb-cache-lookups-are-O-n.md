# SpacetimeDB Cache Lookups Are O(n) Per Query

**Type:** task
**Severity:** medium
**Component:** web
**Reported:** 2026-02-26

## Description

All getter functions in `apps/web/src/spacetime.ts` (lines 145-214) iterate over the entire table using `connection.db.<table>().iter()`. There's no indexing or caching by foreign key.

Functions like `getMessagesForSession()`, `getPartsForMessage()`, and `getToolCommandsForSession()` are called repeatedly during renders (especially in `buildChatMessagesFromCache` in `chat-store.ts`). With hundreds of messages across many sessions, these become expensive.

For a single render of a chat page, the code calls:
1. `getMessagesForSession(sessionId)` which scans ALL messages
2. For each message, `getPartsForMessage(messageId)` which scans ALL message parts
3. `getToolCommandsForSession(sessionId)` which scans ALL tool commands
4. For each tool command, `getToolResultsForCommand(commandId)` which scans ALL tool results

That's O(messages * parts + commands * results) per render.

## Expected Behavior

Build local indexes (Maps) keyed by foreign key fields when data arrives:

```typescript
const messagesBySession = new Map<string, Message[]>();
const partsByMessage = new Map<string, MessagePart[]>();
const commandsBySession = new Map<string, ToolCommand[]>();
const resultsByCommand = new Map<number, ToolResult[]>();
```

Update these Maps in the `onInsert` / `onUpdate` / `onDelete` callbacks. Lookups become O(1) by key.

## Implementation Notes

In `spacetime.ts`:
1. Create index Maps alongside the connection
2. In each table's `onInsert` callback, add to the relevant Map
3. In `onDelete` callbacks, remove from the Map
4. Replace `.iter().filter()` calls with Map lookups
5. Clear Maps on disconnect/reconnect

This is a performance optimization that matters more as conversations get longer. Not urgent for small conversations but will become a bottleneck with heavy usage.

## Resolution

Added local index Maps (`messagesBySession`, `partsByMessage`, `commandsBySession`, `commandsByMessage`, `resultsByCommand`) populated on insert and cleaned on delete. All getter functions now use O(1) Map lookups instead of O(n) table scans. Indexes are rebuilt on subscription applied and cleared on disconnect. Reduces per-render work from O(messages * parts) to O(1) per lookup.
