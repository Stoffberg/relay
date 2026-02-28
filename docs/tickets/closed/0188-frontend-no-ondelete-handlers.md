# Frontend Does Not Register onDelete Handlers for Any Table

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

In `spacetime.ts`, the SpacetimeDB event registration only sets up `onInsert` and `onUpdate` handlers for each table. No `onDelete` handlers are registered for any table (message, session, message_part, tool_command, tool_result, agent).

In `apps/web/src/spacetime.ts` around lines 94-132:

Only `onInsert` and `onUpdate` are called. The SDK provides `onDelete` as well.

If a session, message, or other record is deleted from SpacetimeDB (either by a reducer or admin action), the frontend cache retains the stale data. This means:
1. Deleted sessions still appear in the sidebar
2. Deleted messages still render in the chat
3. Deleted agents still show as "online"

This becomes relevant once session delete (ticket 0011) or data cleanup (ticket 0085) is implemented.

## Expected Behavior

Register `onDelete` handlers that notify the UI:

```typescript
conn.db.session.onDelete((_ctx, session) => {
    notify("onSessionDelete", session);
});

conn.db.message.onDelete((_ctx, msg) => {
    notify("onMessageDelete", msg);
});
```

And handle the delete events in `chat-store.ts` and `__root.tsx` to remove the data from local state.

## Resolution

Added `onDelete` handlers for all 6 SpacetimeDB tables (message, message_part, session, tool_command, tool_result, agent) in spacetime.ts. Added corresponding event types to `SpacetimeListener`. Root component now handles `onSessionDelete` and `onAgentDelete` to refresh sidebar and agent status.

