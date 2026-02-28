# Add Multi-User Support

**Type:** feature
**Severity:** medium
**Component:** web, server
**Reported:** 2026-02-27

## Description

The app currently has no user authentication on the frontend. All sessions are visible to all connected clients. The SpacetimeDB tables store `user_id` (Identity) but it's never validated or used for access control.

If multiple people connect to `code.stoff.dev`, they all see the same conversations and can interfere with each other's sessions.

## Expected Behavior

1. Users authenticate before accessing the chat (OAuth, magic link, or simple password)
2. Each user sees only their own sessions
3. Sessions, messages, and agents are scoped to the authenticated user
4. The RELAY_API_KEY is not exposed to the frontend; instead, the frontend authenticates the user and the backend handles API keys

## Implementation Notes

### Phase 1: Simple Auth (single user, password)
1. Add a login page at `/` that requires a password
2. Store the password hash server side
3. Set an HTTP-only cookie on successful login
4. Validate the cookie on `/chat` requests instead of (or alongside) the API key
5. The frontend no longer needs `VITE_RELAY_API_KEY` in its env

### Phase 2: Multi-User (OAuth)
1. Use WorkOS (already has a client ID in `.env.local`: `VITE_WORKOS_CLIENT_ID`) or another OAuth provider
2. Map OAuth identity to SpacetimeDB identity
3. Filter sessions by user in all queries
4. Add user profile display in sidebar

### Phase 3: Access Control
1. Implement the authorization checks from ticket 0013
2. Scope subscriptions per user so clients don't receive other users' data

## Resolution

_(fill in when resolving)_
