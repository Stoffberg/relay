# Alchemy Deploy Script Has Dead RELAY_API_KEY Code

**Type:** bug
**Severity:** medium
**Component:** infra
**Reported:** 2026-02-27

## Description

In `packages/infra/alchemy.run.ts`, line 7 reads `process.env.RELAY_API_KEY` into a variable, but the worker bindings on lines 20 and 23 hardcode `VITE_RELAY_API_KEY: ""` and `RELAY_API_KEY: ""` as empty strings. The variable is never used.

This means the deployed Cloudflare Worker has empty API key bindings. If any server-side code in the worker tries to use `RELAY_API_KEY`, it gets an empty string. The `API_URL` binding (line 22) is also an empty string.

## Expected Behavior

Either use the environment variable in the bindings, or remove the dead code. If the API key should be passed to the worker, use the variable:

```ts
RELAY_API_KEY: apiKey,
VITE_RELAY_API_KEY: apiKey,
```

If the worker doesn't need the API key (client-side auth is handled differently), remove the unused variable and empty bindings.

## Implementation Notes

Check whether the Cloudflare Worker actually needs these bindings. If yes, wire them up. If no, clean up the dead code.

## Resolution

Removed the dead `RELAY_API_KEY` variable from `alchemy.run.ts`. The worker doesn't need it since the frontend fetches directly to Fly without auth headers (auth is optional, CORS protects browser requests). This was already cleaned up as part of ticket 0148; verified the variable and empty bindings are gone. Deployed to Cloudflare Workers.
