# Cloudflare Worker Missing Security Response Headers

**Type:** task
**Severity:** medium
**Component:** infra
**Reported:** 2026-02-27

## Description

The Cloudflare Worker deployment (via Alchemy) does not configure any security response headers. The frontend at `code.stoff.dev` serves pages without:

- `Content-Security-Policy`: No CSP means inline scripts, external resources, and potential XSS vectors are unrestricted. The app loads Google Fonts via HTTPS (seen in styles.css) but no `font-src` directive locks this down.
- `X-Frame-Options`: The app can be embedded in iframes on any site (clickjacking risk)
- `X-Content-Type-Options`: Browser may MIME-sniff responses
- `Referrer-Policy`: Full referrer URL sent to external resources (Google Fonts, SpacetimeDB)
- `Permissions-Policy`: No restriction on browser features (camera, microphone, etc.)

Note: Ticket 0022 (closed) added security headers to the Fly.io server. This ticket is specifically about the Cloudflare Worker serving the frontend.

## Expected Behavior

Add security headers to the Worker response. This can be done via a Cloudflare Workers middleware or in the TanStack Start server entry point:

```
Content-Security-Policy: default-src 'self'; connect-src 'self' https://code-api.stoff.dev wss://maincloud.spacetimedb.com; font-src https://fonts.gstatic.com; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

## Resolution

Created `apps/web/src/start.ts` with TanStack Start request middleware that sets security headers on every response. Headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security: max-age=63072000`, and a CSP allowing self, inline scripts/styles, Google Fonts, the API server, and SpacetimeDB WebSocket. Verified all headers present in production response.

