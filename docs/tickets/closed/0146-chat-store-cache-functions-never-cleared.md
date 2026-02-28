# ChatSessionStore Cache Functions Never Cleared

**Type:** bug
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The `ChatSessionStore` maintains two caches (`msgSubscribeFnCache` and `msgSnapshotFnCache`) that store per-message subscribe and snapshot functions for `useSyncExternalStore`. These caches are populated as messages are rendered but never cleaned up when:
1. The store is destroyed (navigating to a different session)
2. Messages are deleted
3. The message list changes significantly

In `apps/web/src/lib/chat-store.ts` around lines 95-96 and 372-401:

These Maps grow monotonically. In a long session with hundreds of messages, or a user who navigates between many sessions, the accumulated closures and cached functions occupy memory that's never reclaimed.

## Expected Behavior

Clear both caches in the `destroy()` method:

```typescript
destroy() {
    this.removeListener?.();
    this.msgSubscribeFnCache.clear();
    this.msgSnapshotFnCache.clear();
}
```

Also consider evicting entries for messages that are no longer in `messageIds` during `mergeMessages()`.

## Resolution

Added `this.msgSubscribeFnCache.clear()` and `this.msgSnapshotFnCache.clear()` to the `destroy()` method in `ChatSessionStore`. Both caches are now cleaned up when the store is destroyed on session navigation.

