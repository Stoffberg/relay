# Chat Route Has No Fallback When VITE_API_URL Is Unset

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

In `chat.$sessionId.tsx`, `API_URL` is read from `import.meta.env.VITE_API_URL` with no fallback or validation. If the environment variable isn't set (e.g., local development without a `.env` file), `fetch` will call `undefined/chat`, which fails silently or throws a network error with no helpful message.

## Steps to Reproduce

1. Run the web app locally without `VITE_API_URL` set
2. Send a message
3. Fetch fails with a cryptic network error pointing at `undefined/chat`

## Expected Behavior

Either provide a sensible default (e.g., `http://localhost:3000`) for local development, or throw a clear error at startup when the variable is missing.

## Implementation Notes

Add a fallback and/or validation:

```tsx
const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) {
  console.error("VITE_API_URL is not configured");
}
```

Or provide a default for local dev: `const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";`

## Resolution

Added a fallback to `http://localhost:3000` when `VITE_API_URL` is unset in `chat.$sessionId.tsx`. Local development now works without a `.env` file. Production has the env var set via Alchemy so behavior is unchanged. Deployed to Cloudflare Workers.
