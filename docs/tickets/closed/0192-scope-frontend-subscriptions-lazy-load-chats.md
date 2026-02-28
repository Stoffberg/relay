# Scope Frontend SpacetimeDB Subscriptions to Lazy-Load Chat Data

**Type:** bug
**Severity:** critical
**Component:** web
**Reported:** 2026-02-27

## Description

The frontend subscribes to ALL rows from ALL 6 SpacetimeDB tables on initial connection. With even a handful of chat sessions, the initial subscription payload is ~2MB gzipped. Every message, every message part, every tool command, every tool result across all sessions is downloaded and cached in the browser on page load. This makes the app slow to start, wastes bandwidth, and consumes excessive memory.

In `apps/web/src/spacetime.ts` around lines 66-79:

```typescript
conn.subscriptionBuilder()
    .onApplied(() => {
        subscriptionApplied = true;
        notify("onSubscriptionApplied");
    })
    .subscribe([
        "SELECT * FROM session",
        "SELECT * FROM message",
        "SELECT * FROM message_part",
        "SELECT * FROM tool_command",
        "SELECT * FROM tool_result",
        "SELECT * FROM agent",
    ]);
```

Every table is `SELECT *` with no filtering. The user might have 50 sessions with 500+ messages total, but they only need to see one session at a time.

## Expected Behavior

Use a tiered subscription strategy:

**Tier 1 (on connect):** Load only session metadata and agents
```typescript
conn.subscriptionBuilder().subscribe([
    "SELECT * FROM session",
    "SELECT * FROM agent",
]);
```

This gives the sidebar the session list (titles, timestamps, statuses) without loading any message content. Payload: tiny.

**Tier 2 (on session open):** When the user clicks or hovers on a session, subscribe to that session's data
```typescript
conn.subscriptionBuilder().subscribe([
    `SELECT * FROM message WHERE session_id = '${sessionId}'`,
    `SELECT * FROM message_part WHERE message_id IN (SELECT id FROM message WHERE session_id = '${sessionId}')`,
    `SELECT * FROM tool_command WHERE session_id = '${sessionId}'`,
    `SELECT * FROM tool_result WHERE tool_command_id IN (SELECT id FROM tool_command WHERE session_id = '${sessionId}')`,
]);
```

**Tier 3 (on session leave):** Optionally unsubscribe from the previous session's data to free memory. Keep a small LRU cache of recently viewed sessions for quick back-navigation.

## Implementation Notes

SpacetimeDB subscriptions support `WHERE` clauses. The SDK's `subscriptionBuilder()` accepts SQL strings with filters. The key changes:

1. Split the single subscription call into two: one for global data (sessions, agents) and one per-session for chat data
2. Store the per-session `SubscriptionHandle` so it can be unsubscribed when navigating away
3. The `ChatSessionStore` constructor should trigger the per-session subscription
4. The `ChatSessionStore.destroy()` should unsubscribe

For the sidebar, session metadata (title, status, updatedAt) comes from the `session` table which is always subscribed. No message content needed for the sidebar.

The hover-to-prefetch pattern: on `mouseenter` of a sidebar session item, start the subscription. By the time the user clicks, the data is likely already loaded. This gives perceived instant loading.

Check the SpacetimeDB SDK docs for:
- Whether `subscriptionBuilder()` can be called multiple times on the same connection
- Whether `SubscriptionHandle.unsubscribe()` exists and works correctly
- Whether filtered subscriptions with subqueries (`IN (SELECT ...)`) are supported
- Whether subscription updates are incremental (only changed rows) or full re-sends

This is the single biggest performance improvement possible for the frontend. Everything else is optimization; this is architecture.

## Resolution

Implemented tiered subscription architecture in `spacetime.ts`:

**Tier 1 (global, on connect):** Only subscribes to `session` + `agent` tables. Gives the sidebar its session list without loading any message content.

**Tier 2 (per session, on navigate):** New `subscribeToSession(sessionId)` function subscribes to `message` and `tool_command` filtered by `session_id`, plus full `message_part` and `tool_result` tables (SpacetimeDB SQL doesn't support subqueries, so these can't be filtered by session). The `onApplied` callback rebuilds the client side caches with session filtering.

**Tier 3 (on leave):** `unsubscribeFromSession()` cleans up the per session subscription and clears caches. Follows SpacetimeDB best practice of subscribing to the new session before unsubscribing from the old one (zero copy dedup).

Changes: `spacetime.ts` (tiered subscriptions, new exports), `__root.tsx` (simplified sidebar preview to session metadata only, removed message data dependency), `chat.$sessionId.tsx` (calls `subscribeToSession` on session change).

Key discovery: SpacetimeDB SQL does NOT support `IN (SELECT ...)` subqueries. Falling back to full table subscriptions for `message_part` and `tool_result` with client side filtering. Ticket 0012 (add indexes) would enable JOIN based filtering as a future optimization.

