# Add SpacetimeDB Reconnection with Retry

**Type:** feature
**Severity:** high
**Component:** web
**Reported:** 2026-02-26

## Description

In `apps/web/src/spacetime.ts` (lines 81-91), when the SpacetimeDB connection drops or errors, the state is reset to "error" or "disconnected" but there's no automatic reconnection attempt. The user must manually reload the page to reconnect.

This is especially painful on mobile where connections drop frequently, or when SpacetimeDB maincloud has brief outages.

## Expected Behavior

Implement automatic reconnection with exponential backoff:
1. On disconnect, wait 1 second then try to reconnect
2. If that fails, wait 2 seconds, then 4, then 8, capping at 30 seconds
3. Show a "Reconnecting..." indicator in the UI (not just the red dot)
4. On successful reconnection, re-subscribe and refresh all data
5. After N failures (e.g., 10), stop retrying and show "Connection lost. Click to retry."

## Implementation Notes

In `apps/web/src/spacetime.ts`:
1. In the `onDisconnect` handler, schedule a reconnection attempt with `setTimeout`
2. Track retry count and calculate delay with `Math.min(1000 * 2 ** retryCount, 30000)`
3. On `onConnect`, reset retry count to 0
4. Add a `reconnecting` state to `connState` (or keep it as "connecting")

In the UI (`sidebar.tsx` ConnectionIndicator):
1. Show "Reconnecting..." with a spinning icon when retry is in progress
2. Show retry count if user wants to know
3. After max retries, show a clickable "Retry" button

## Resolution

Added automatic reconnection with exponential backoff to `spacetime.ts`. On disconnect or connect error, schedules a retry with delays of 1s, 2s, 4s, 8s, 16s, 30s (capped). Max 10 retries before giving up. Added "reconnecting" to `ConnectionState` type. The sidebar's ConnectionIndicator shows a pulsing yellow dot with "reconnecting" label. Intentional disconnects (via `disconnect()`) skip the retry logic. Exported `retryConnection()` for manual retry trigger. On successful reconnect, retry count resets to 0.
