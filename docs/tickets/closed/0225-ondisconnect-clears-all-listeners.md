# SpacetimeDB onDisconnect Clears All Active Listeners

**Type:** bug
**Severity:** high
**Component:** web
**Reported:** 2026-02-27

## Description

In `spacetime.ts`, the `onDisconnect` handler calls `listeners.clear()`, which removes all registered event listeners including those added by the root component's `useEffect`. If the connection is later re-established (once reconnection is implemented), the root component won't receive any events because its listeners were destroyed.

This is a regression from the original issue where listeners were never cleaned (ticket 0141, closed). The fix went too far in the other direction: instead of cleaning up stale listeners, it nukes all listeners including ones that are still active and needed.

## Steps to Reproduce

1. Connect to SpacetimeDB normally
2. Root component registers listeners in `useEffect`
3. Connection drops (network issue, server restart)
4. `onDisconnect` fires, calls `listeners.clear()`
5. If reconnection happens, no events are dispatched to the UI

## Expected Behavior

`onDisconnect` should only clear the SpacetimeDB connection reference and update connection state, not destroy the listener registry. Listeners are owned by React components and should be cleaned up by their respective `useEffect` cleanup functions.

## Implementation Notes

Remove `listeners.clear()` from the `onDisconnect` handler. The listener map should persist across connection cycles so that components don't need to re-register when the connection is restored.

## Resolution

Removed the `listeners.clear()` call from the `onDisconnect` handler in `spacetime.ts`. The listener registry now persists across connection cycles. Components manage their own listener lifecycle through `useEffect` cleanup functions. The disconnect handler still resets connection state and nulls the connection reference.
