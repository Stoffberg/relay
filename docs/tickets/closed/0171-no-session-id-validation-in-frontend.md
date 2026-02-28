# No Session ID Validation in Frontend URL Route

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The chat route at `/chat/$sessionId` extracts the session ID from the URL via `Route.useParams()` without any validation. A user can navigate to any URL and the component renders without checking if the session exists, if the ID is a valid format, or if it contains special characters.

In `apps/web/src/routes/chat.$sessionId.tsx` around line 32:

The `sessionId` parameter is used directly to create a `ChatSessionStore`, query SpacetimeDB, and send messages to the server. Invalid or malicious session IDs (empty string, XSS payloads, extremely long strings, path traversal sequences) all pass through to the backend.

## Steps to Reproduce

1. Navigate to `https://code.stoff.dev/chat/not-a-real-session`
2. Page renders with empty chat area, no indication the session doesn't exist
3. Sending a message creates a new session with the arbitrary ID

## Expected Behavior

1. Validate the session ID format (e.g., UUID pattern or reasonable alphanumeric)
2. If the session doesn't exist in SpacetimeDB cache after subscription loads, show an "empty state" message or redirect to create a new session
3. Reject session IDs over a reasonable length (e.g., 100 characters)

## Resolution

Added a regex validation check in `chat.$sessionId.tsx` that rejects session IDs not matching `^[a-zA-Z0-9_-]{1,100}$`. Invalid IDs render an error state instead of creating a broken session. This prevents XSS payloads, path traversal, and excessively long strings from reaching the backend.

