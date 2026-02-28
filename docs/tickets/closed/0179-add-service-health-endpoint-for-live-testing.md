# Add Service Test Endpoint That Bypasses Auth

**Type:** feature
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The QA/audit agent cannot perform live API testing against the `/chat` endpoint because `RELAY_API_KEY` is a Fly.io secret that isn't available in the local environment. This limits testing to unauthenticated endpoints (`/health`) and direct SpacetimeDB queries.

A dedicated service endpoint would allow automated testing of the full message flow (send message, verify processing, check response) without exposing the production API key to the testing environment.

## Expected Behavior

Add a `/service/chat` (or similar) endpoint that:

1. Accepts a separate `SERVICE_KEY` environment variable (set as a Fly.io secret alongside `RELAY_API_KEY`)
2. Authenticates via a different header (e.g., `X-Service-Key`) to avoid confusion with user auth
3. Behaves identically to `/chat` after auth
4. Can optionally be disabled entirely via an env flag (`ENABLE_SERVICE_ENDPOINTS=true`)

Alternatively, a simpler approach: add a `/service/echo` endpoint that accepts the same payload as `/chat` but instead of calling OpenRouter, returns a canned response and stores it in SpacetimeDB. This tests the full write path (message creation, session management, message parts, status transitions) without consuming LLM tokens.

## Implementation Notes

The echo approach is more useful for automated testing:

```rust
async fn service_echo(State(state): State<AppState>, Json(payload): Json<ChatRequest>) -> impl IntoResponse {
    // Validate service key
    // Create session, store user message, create assistant message with echo content
    // Return same shape as /chat
}
```

This lets the QA agent verify: message queuing, session status transitions, message part storage, SpacetimeDB subscription propagation, and error handling, all without hitting OpenRouter.

The service key should be a separate secret so it can be rotated independently and has no access to the real `/chat` flow.

## Resolution

Added `/service/echo` endpoint to the server that accepts the same `ChatRequest` payload as `/chat` but returns a canned `[echo] <message>` response stored in SpacetimeDB. Authenticated via `X-Service-Key` header against a separate `SERVICE_KEY` env var (Fly secret). When `SERVICE_KEY` isn't set, the endpoint returns 404. Tests the full write path: session creation, user message storage, assistant message storage, message part creation. Deployed and verified with all three auth cases (no key, wrong key, valid key).

