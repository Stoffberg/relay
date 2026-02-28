# SpacetimeDB Subscription Handle Discarded on Server and Frontend

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

Both the server and frontend call `subscription_builder().subscribe([...])` but discard the returned `SubscriptionHandle`. The SDK provides this handle to monitor subscription health (`is_active()`, `is_ended()`) and to unsubscribe when no longer needed.

In `apps/server/src/main.rs` around lines 282-301:
```rust
conn.subscription_builder()
    .on_applied(...)
    .on_error(...)
    .subscribe([...]); // Handle discarded
```

In `apps/web/src/spacetime.ts` around lines 66-79:
```typescript
conn.subscriptionBuilder()
    .onApplied(...)
    .subscribe([...]); // Handle discarded
```

Without the handle, there's no way to:
1. Check if the subscription is still active
2. Detect silent subscription failures after initial connection
3. Properly unsubscribe on cleanup

## Expected Behavior

Store the subscription handle and use it for health monitoring:

```rust
let sub_handle = conn.subscription_builder()
    .on_applied(...)
    .on_error(...)
    .subscribe([...]);

// Later, check health:
if sub_handle.is_ended() {
    tracing::error!("Subscription ended unexpectedly");
    // Attempt reconnection
}
```

## Resolution

Stored the `SubscriptionHandle` returned by `subscription_builder().subscribe()` in both the server's `AppState` and the agent's `AgentState` structs as `_subscription_handle`. The handle is kept alive for the lifetime of the application, preventing premature cleanup and making it available for future health monitoring or unsubscribe calls.

