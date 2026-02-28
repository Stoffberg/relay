# SpacetimeDB Event Listeners Never Cleaned on Disconnect

**Type:** bug
**Severity:** high
**Component:** web
**Reported:** 2026-02-27

## Description

In `spacetime.ts`, 14 event handlers are registered on the `DbConnection` instance (`onInsert` and `onUpdate` for each table) during `connectToSpacetime()`. When the connection disconnects, `onDisconnect()` sets `connection = null` but never removes these handlers from the connection object. If the object is retained in memory (by closures or the SpacetimeDB SDK), the handlers keep firing on stale data.

Additionally, the module-level `listeners` Set is never cleared on disconnect. Listeners added by `addListener()` persist forever. If `connectToSpacetime()` is called again after disconnect, a new connection is created with its own set of 14 handlers, but the old listeners in the Set are also still present and fire on the new connection's events. This causes duplicate event processing.

In `spacetime.ts` around lines 53-132:

The `onDisconnect` callback at line 81-85 only does:
```typescript
connection = null;
subscriptionApplied = false;
notify("onConnectionChange", "disconnected");
```

No cleanup of `listeners` Set or table-level `onInsert`/`onUpdate` handlers.

## Expected Behavior

On disconnect:
1. Clear or invalidate all entries in the `listeners` Set
2. Provide a way for components to know their listener is stale
3. On reconnect, re-register subscriptions (currently the subscription is only set up in the initial `onConnect` callback at lines 66-79)

## Implementation Notes

The simplest fix: clear the `listeners` Set on disconnect and have each component re-add its listener when it detects reconnection. Alternatively, track a connection generation counter and have `notify()` skip listeners that were registered for a previous generation.

## Resolution

Added `listeners.clear()` in the `onDisconnect` callback in spacetime.ts. This prevents stale listeners from firing on reconnect and avoids duplicate event processing if `connectToSpacetime` is called again.

