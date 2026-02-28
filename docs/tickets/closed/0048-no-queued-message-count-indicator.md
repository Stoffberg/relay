# No Queued Message Count Indicator

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

When users send multiple messages rapidly (which the system supports via queuing), there's no visual indication of how many messages are waiting to be processed. The input stays enabled and the user can keep typing, but they have no idea if 1 or 10 messages are in the queue.

This leads to:
1. Users accidentally sending duplicates because they don't see the first one was accepted
2. Confusion about whether the system is processing their messages
3. No feedback loop about system load

## Expected Behavior

Show a small badge or indicator near the input bar or in the status area:
1. "2 messages queued" when messages are waiting
2. A subtle progress indicator showing queue drain
3. The count updates in real time as messages are processed

## Implementation Notes

In `chat-store.ts`, count messages with status "queued" or "optimistic" for the current session. Expose this as a computed property.

In the chat route or input bar component, show the count when > 0:

```tsx
{queuedCount > 0 && (
  <span className="text-xs text-muted">{queuedCount} queued</span>
)}
```

The count can be derived from SpacetimeDB subscription data (messages with status "queued" in the current session).

## Resolution

Added `getQueuedCount()` method to `ChatSessionStore` that counts messages with status "queued" or "optimistic". Chat page subscribes via `useSyncExternalStore` and shows "{n} message(s) queued" above the input bar when count > 0.
