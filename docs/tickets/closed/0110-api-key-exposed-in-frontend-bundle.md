# API Key Exposed in Frontend Bundle

**Type:** bug
**Severity:** critical
**Component:** web
**Reported:** 2026-02-27

## Description

The API key used to authenticate with the server is embedded directly in the frontend via `import.meta.env.VITE_RELAY_API_KEY` in `chat.$sessionId.tsx`. Since Vite bundles all `VITE_` prefixed env vars into the client JavaScript, anyone can extract the key from browser devtools, network inspection, or the source bundle.

In `apps/web/src/routes/chat.$sessionId.tsx` around line 10:

```typescript
const API_KEY = import.meta.env.VITE_RELAY_API_KEY;
```

This key is then sent as a Bearer token on every request to `/chat`.

## Expected Behavior

The API key should never be in client-side code. Options:

1. **Session based auth**: Server issues a session cookie after some authentication flow, and the frontend sends it automatically.
2. **Proxy through Cloudflare Worker**: The Worker adds the API key server side before forwarding to Fly.io, so the browser never sees it.
3. **Public endpoint with per-user auth**: If this is a single user app, a simpler auth token exchange or basic login could work.

## Implementation Notes

For a single user personal project, option 2 (Worker proxy) is the quickest fix. The Cloudflare Worker already serves the frontend; it can also proxy `/api/*` to `code-api.stoff.dev` with the key injected as a secret binding.

This would also simplify CORS since the browser talks to the same origin.

## Resolution

Moved the API call from client side fetch to a TanStack Start `createServerFn` that runs on the Cloudflare Worker. The Worker reads `RELAY_API_KEY` from a non-VITE binding (`process.env.RELAY_API_KEY`) and injects the Bearer token server side. The client bundle no longer contains the API key. Verified by inspecting the built client JS.

