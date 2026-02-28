# Chat Store cachedMessageIds Never Updates After Subscription

**Type:** bug
**Severity:** high
**Component:** web
**Reported:** 2026-02-26

## Description

In `apps/web/src/lib/chat-store.ts` line 180, the `onPartInsert` handler skips part updates if the `messageId` is found in `cachedMessageIds`:

```ts
if (this.cachedMessageIds.has(messageId)) return;
```

The problem is `cachedMessageIds` is populated in `onSubscriptionApplied` (during initial load) and never updated afterward. So any message that arrives after the initial subscription (i.e., new messages from the LLM) will have its parts skipped because:

1. The message arrives via `onMessageInsert` and gets added to `cachedMessageIds`
2. Parts arrive via `onPartInsert`, see the ID in `cachedMessageIds`, and skip

Wait, actually: `cachedMessageIds` is set on subscription applied as the set of IDs that were already fully loaded from cache. The intent is to avoid re-processing parts for messages that already have their content. But if a new message is inserted after subscription, `onMessageInsert` at line 141 does NOT add to `cachedMessageIds`. So new message parts should work fine.

The actual bug is the reverse: if the user reconnects (SpacetimeDB disconnect + reconnect), `onSubscriptionApplied` fires again and rebuilds `cachedMessageIds` with ALL current message IDs, including messages that are still streaming. Parts for those streaming messages will be skipped, freezing the stream mid-response.

## Steps to Reproduce

1. Start a chat and send a message
2. While the LLM is streaming a response, disconnect and reconnect to SpacetimeDB (e.g., toggle WiFi briefly)
3. The reconnection triggers `onSubscriptionApplied` which marks the streaming message's ID as "cached"
4. Subsequent parts for that message are skipped
5. The streaming message appears frozen

## Expected Behavior

On reconnection, `cachedMessageIds` should only include messages with status "complete", not streaming or queued messages. This way, in-progress messages can continue receiving parts after reconnection.

## Implementation Notes

In `apps/web/src/lib/chat-store.ts`, in the `onSubscriptionApplied` handler, filter `cachedMessageIds` to only include messages where `status === "complete"`:

```ts
this.cachedMessageIds = new Set(
  messages.filter(m => m.status === "complete").map(m => m.id)
);
```

## Resolution

Changed cachedMessageIds filtering in both the constructor and onSubscriptionApplied handler to only include messages with status 'complete'. This ensures streaming or queued messages can still receive part updates after a SpacetimeDB reconnection.
