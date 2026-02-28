# Add Shareable Session Links

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

Users can't share a conversation with someone else. The URL includes the session ID (`/chat/<uuid>`) but since there's no auth scoping (yet), anyone with the URL could potentially see the session if they connect to the SpacetimeDB instance.

A proper sharing feature would let users generate read-only links to conversations.

## Expected Behavior

1. "Share" option in session context menu or command palette
2. Generates a shareable URL (e.g., `code.stoff.dev/share/<token>`)
3. The shared view is read-only (no input bar, no editing)
4. The share link shows the conversation as it was at the time of sharing (snapshot) or updates in real time (live link)
5. Share links can be revoked

## Implementation Notes

### Schema
Add a `session_share` table:
```rust
pub struct SessionShare {
    pub id: String,        // random token
    pub session_id: String,
    pub created_at: Timestamp,
    pub expires_at: Option<Timestamp>,
}
```

### Frontend
1. New route: `/share/$shareId` that renders messages read-only
2. Share button in session context menu
3. Copy share link to clipboard

### Server
No changes needed if the share route reads directly from SpacetimeDB subscriptions.

This pairs well with multi-user support (ticket 0071) where sharing across users makes more sense.

## Resolution

_(fill in when resolving)_
