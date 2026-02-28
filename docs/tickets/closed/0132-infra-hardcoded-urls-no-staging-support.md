# Infrastructure Deployment Has Hardcoded URLs With No Staging Support

**Type:** task
**Severity:** medium
**Component:** infra
**Reported:** 2026-02-27

## Description

The Cloudflare Workers deployment in `packages/infra/alchemy.run.ts` has several hardcoded values that prevent running a staging or development environment:

1. `API_URL = "https://code-api.stoff.dev"` (line 4): always points to production
2. `SPACETIME_URL` pointing to maincloud (line 5): no staging database
3. `SPACETIME_DB_NAME = "relay"` (line 6): no environment-specific namespace
4. `STAGE` defaults to `"production"` (line 10): accidental dev deploys go to prod

The `RELAY_API_KEY` is also not validated at build time. If the env var is missing, it silently passes an empty string, which means the deployed frontend sends empty Bearer tokens.

## Expected Behavior

All deployment config should read from environment variables with sane defaults:

```typescript
const API_URL = process.env.API_URL ?? "https://code-api.stoff.dev";
const SPACETIME_URL = process.env.SPACETIME_URL ?? "wss://maincloud.spacetimedb.com";
const SPACETIME_DB_NAME = process.env.SPACETIME_DB_NAME ?? "relay";

if (!process.env.RELAY_API_KEY) {
    throw new Error("RELAY_API_KEY is required for deployment");
}
```

And `STAGE` should default to `"development"` or require explicit setting for production.

## Resolution

Made `API_URL`, `SPACETIME_URL`, and `SPACETIME_DB_NAME` in `alchemy.run.ts` configurable via environment variables with existing production values as defaults. Staging deployments can override via `API_URL=... bun run alchemy.run.ts`.

