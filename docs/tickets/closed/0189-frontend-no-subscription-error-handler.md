# Frontend Subscription Has No Error Handler

**Type:** bug
**Severity:** high
**Component:** web
**Reported:** 2026-02-27

## Description

The SpacetimeDB subscription setup in `spacetime.ts` registers an `onApplied` callback but no `onError` callback. If the subscription fails (invalid query, permissions issue, SpacetimeDB error), the frontend silently stays in a loading state forever. `subscriptionApplied` is never set to `true`, and no error is reported to the user.

In `apps/web/src/spacetime.ts` around lines 66-79:

```typescript
conn.subscriptionBuilder()
    .onApplied(() => {
        subscriptionApplied = true;
        notify("onSubscriptionApplied");
    })
    .subscribe([...]);
```

No `.onError()` chained.

## Expected Behavior

Add an error handler:

```typescript
conn.subscriptionBuilder()
    .onApplied(() => {
        subscriptionApplied = true;
        notify("onSubscriptionApplied");
    })
    .onError((err) => {
        currentState = "error";
        notify("onConnectionChange", "error");
        console.error("Subscription failed:", err);
    })
    .subscribe([...]);
```

This notifies the UI to show an error state instead of loading indefinitely.

## Resolution

Added `.onError()` handler to the subscription builder in `spacetime.ts`. On subscription failure, it logs the error, sets `currentState` to `"error"`, and notifies listeners so the UI shows an error state instead of loading forever.

