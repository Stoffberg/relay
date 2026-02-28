# Add Authentication to Chat Endpoint

**Type:** feature
**Severity:** critical
**Component:** server
**Reported:** 2026-02-26

## Description

The `/chat` POST endpoint has zero authentication. Any IP can call it with any `session_id` and inject messages into anyone's conversation. CORS is set to `CorsLayer::permissive()` so any browser origin can hit it too.

This means:
1. Session hijacking: anyone can POST to a known session_id and add messages
2. No user identity: server has no concept of who is calling
3. Resource abuse: no way to tie API calls to a user for rate limiting

## Expected Behavior

The `/chat` endpoint should require authentication. Options include:

1. **API key per user**: Simple Bearer token in Authorization header. Server validates against a stored key in SpacetimeDB or environment variable.
2. **SpacetimeDB identity tokens**: Use SpacetimeDB's built in identity system. The frontend already has a connection identity; derive a token from it and pass it in the HTTP call.
3. **Simple shared secret**: Since this is a single user app right now, a `RELAY_API_KEY` env var on the server that must match a header sent by the frontend.

Option 3 is the easiest short term fix. The frontend would read the key from an env variable or config and include it in the POST header. Server rejects requests without a valid key.

## Implementation Notes

Server side (`apps/server/src/main.rs`):
1. Add `RELAY_API_KEY` env var (required)
2. In `chat_handler`, extract `Authorization: Bearer <key>` header
3. Return 401 if missing or mismatched
4. Remove `CorsLayer::permissive()` and replace with explicit allowed origins (`code.stoff.dev`)

Frontend (`apps/web/`):
1. Pass the API key in the fetch call in `chat.$sessionId.tsx` as a Bearer token
2. Store key in environment config (Cloudflare Workers env binding)

## Resolution

Implemented Option 3 (shared secret). Server reads `RELAY_API_KEY` env var (required at startup), validates `Authorization: Bearer <key>` header in chat_handler, returns 401 with error message if missing or mismatched. Replaced `CorsLayer::permissive()` with explicit CORS allowing `https://code.stoff.dev` and `http://localhost:3001` for local dev. Frontend reads `VITE_RELAY_API_KEY` from Cloudflare Worker env binding and sends it as Bearer token. Alchemy infra config passes `RELAY_API_KEY` from process env into the worker binding. Verified: unauthenticated requests get 401, wrong tokens get 401, correct token gets 200, CORS preflight passes for allowed origin.
