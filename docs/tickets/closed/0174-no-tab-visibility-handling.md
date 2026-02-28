# No Tab Visibility or Background Handling

**Type:** task
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The frontend has no handling for browser tab visibility changes (`visibilitychange` event). When a tab is backgrounded for an extended period:

1. The SpacetimeDB WebSocket may disconnect due to server-side idle timeout
2. The `onDisconnect` callback fires but no reconnection happens (see ticket 0008)
3. When the tab is foregrounded, the user sees stale data with no indication that the connection was lost
4. No `beforeunload` handler warns about unsent messages

## Expected Behavior

Add a `visibilitychange` listener that:
1. On background: reduce polling frequency or pause non-essential updates
2. On foreground: check connection status, reconnect if needed, refresh session data
3. Optionally add a stale-data indicator if the last SpacetimeDB update was more than N seconds ago

## Implementation Notes

This complements ticket 0008 (reconnection retry) but addresses the browser-specific trigger. Even with reconnection logic, the app needs to know *when* to reconnect, and tab visibility is the primary signal.

## Resolution

Added a `visibilitychange` event listener in `__root.tsx`. When the tab becomes visible and the SpacetimeDB connection state is `"disconnected"`, it calls `connectToSpacetime()` to re-establish the WebSocket connection. Cleans up the listener on unmount. Deployed to Cloudflare Workers.

