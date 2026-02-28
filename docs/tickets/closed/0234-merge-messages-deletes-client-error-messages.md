# mergeMessages Deletes Client-Side Error Messages on Subscription Refresh

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

In `chat-store.ts`, the `mergeMessages` function deletes any message from the local map that isn't in the fresh SpacetimeDB cache and isn't status "optimistic". This correctly cleans up stale data, but it also deletes error messages added via `addErrorMessage` which have status "error".

These error messages are client-side only (e.g., "Failed to send message") and never exist in SpacetimeDB. On the next subscription refresh, they get purged from the map, making the error disappear from the UI.

## Steps to Reproduce

1. Send a message that fails (e.g., network error)
2. An error message appears in the chat
3. Wait for a subscription refresh (any change in any table triggers this)
4. The error message disappears

## Expected Behavior

Client-side error messages should persist until the user takes action (like retrying or navigating away). The merge logic should preserve messages with status "error" that were added locally.

## Implementation Notes

Add "error" to the preserve condition alongside "optimistic":

```tsx
if (!freshIds.has(id) && msg.status !== "optimistic" && msg.status !== "error") {
  this.messageMap.delete(id);
}
```

Or better: track locally-created messages with a separate flag rather than overloading the status field.

## Resolution

Added "error" to the preserve condition in `mergeMessages` alongside "optimistic". Client-side error messages (e.g., "Failed to send message") now survive subscription refreshes until the user retries or navigates away.
