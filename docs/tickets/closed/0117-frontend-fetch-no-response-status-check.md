# Frontend Fetch Does Not Check HTTP Response Status

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The chat message sending logic in `chat.$sessionId.tsx` does not check `res.ok` or `res.status` after fetching. A server error (500, 502, 503) that returns a body without an `error` field will be treated as a successful response, leaving the user with no feedback that their message wasn't processed.

In `apps/web/src/routes/chat.$sessionId.tsx` around lines 92-103:

```typescript
const res = await fetch(`${API_URL}/chat`, { ... });
const data = (await res.json()) as { error?: string };

if (data.error) {
    // only handles explicit error field
}
```

Additionally, if the response body is not valid JSON (e.g., an HTML error page from a proxy), `res.json()` throws and the catch block shows `String(err)` which is cryptic to the user.

## Expected Behavior

Check `res.ok` before parsing:

```typescript
if (!res.ok) {
    const text = await res.text();
    // show user-friendly error based on status code
    return;
}
const data = await res.json();
```

Also add a request timeout (e.g., 30 seconds via `AbortController`) since the fetch currently hangs indefinitely on network issues.

## Implementation Notes

The `AbortController` timeout pattern:

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);
try {
    const res = await fetch(url, { signal: controller.signal, ... });
} finally {
    clearTimeout(timeout);
}
```

## Resolution

Replaced the `createServerFn` proxy with a direct client fetch to the Fly.io API. The server function approach caused redirect loops because the Cloudflare Worker's outbound fetch to `code-api.stoff.dev` went through Cloudflare's proxy network and looped. The direct fetch checks `res.ok` before parsing and extracts error messages from non-OK responses, falling back to a generic `"Request failed (status)"` message. Auth was also removed from the frontend since CORS + rate limiting is sufficient; proper auth will come with multi-user support.

