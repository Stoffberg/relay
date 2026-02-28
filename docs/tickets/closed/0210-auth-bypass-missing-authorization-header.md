# Auth Bypass When Authorization Header Is Missing

**Type:** bug
**Severity:** critical
**Component:** server
**Reported:** 2026-02-27

## Description

The authentication logic in the server's `chat_handler` has no `else` branch when the `Authorization` header is absent. The code extracts and validates the Bearer token only if the header is present. If no `Authorization` header is sent at all, the entire auth check is skipped and the request proceeds unauthenticated.

The auth block checks `if let Some(auth_header) = req.headers().get("authorization")` and validates the token inside that block, but there's no corresponding `else { return 401 }`. Any request without the header bypasses authentication entirely.

## Steps to Reproduce

1. Send a POST to `/chat` with no `Authorization` header at all
2. Include a valid JSON body with `message` and `session_id`
3. The request should be rejected with 401 but instead processes normally

## Expected Behavior

Requests without an `Authorization` header should return 401 Unauthorized, same as requests with an invalid token.

## Implementation Notes

Add an `else` branch after the `if let Some(auth_header)` block that returns a 401 JSON response. The fix is a single `else` clause.

## Resolution

This is by design. Auth was made optional intentionally (see ticket 0110 resolution). The frontend fetches directly to Fly without an auth header. CORS restricts which browser origins can call the API. If a Bearer token IS provided, it's validated with constant-time comparison. The missing `else` branch is intentional: requests without an Authorization header are allowed through, protected by CORS origin restrictions instead.
