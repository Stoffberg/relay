# Multiple Browser Tabs on Same Session Can Cause Race Conditions

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

Each browser tab creates its own SpacetimeDB WebSocket connection and its own `ChatSessionStore` instance. If a user opens the same session in two tabs and sends messages from both, the server receives requests for the same `session_id` simultaneously. While the server's queue system processes messages sequentially per session, the two tabs' local stores can diverge:

1. Both tabs add optimistic messages independently
2. SpacetimeDB subscription updates arrive to both tabs, but in potentially different orders
3. The `awaitingResponse` flag is managed independently per tab, so one tab may show "thinking" while the other doesn't
4. Tool call states can appear out of sync

## Steps to Reproduce

1. Open `code.stoff.dev/chat/some-session` in two tabs
2. Send a message from tab A
3. Quickly send a different message from tab B
4. Both tabs show different "thinking" states and may briefly show messages in different orders

## Expected Behavior

Options:
1. Detect and warn about multi-tab usage for the same session
2. Use a `BroadcastChannel` to synchronize state between tabs
3. Accept the behavior but ensure both tabs converge to the same state once all subscriptions catch up (they likely do, but the intermediate states are confusing)

## Implementation Notes

The simplest fix is to accept the behavior as-is but add a small banner in the second tab: "This session is open in another tab." Using the `BroadcastChannel` API, tabs can announce which session they're viewing.

## Resolution

Added multi-tab detection using `BroadcastChannel("relay-session")`. Each tab announces which session it's viewing on mount, listens for other tabs announcing the same session, and announces close on unmount. When a duplicate is detected, shows a subtle banner: "This session is open in another tab" between the error banner and metadata header. This warns users without blocking any functionality; both tabs continue to work and converge to the same state via SpacetimeDB subscriptions.

