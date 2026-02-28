# Add Deployment Step to CI Pipeline

**Type:** task
**Severity:** medium
**Component:** infra
**Reported:** 2026-02-26

## Description

The GitHub Actions CI pipeline (`.github/workflows/ci.yml`) runs lint, typecheck, Rust tests, and builds on push to main and PRs. But there's no deployment job. Deploys are manual via `bun run deploy`.

This means:
1. Code can be merged to main without being deployed
2. Manual deploy steps can be forgotten or done incorrectly
3. No deployment audit trail in CI

## Expected Behavior

Add a deployment job that runs after all checks pass on push to main (not on PRs):

1. Deploy SpacetimeDB schema (only if `packages/spacetime/` changed)
2. Deploy server to Fly.io (only if `apps/server/` changed)
3. Deploy web to Cloudflare Workers (only if `apps/web/` or `packages/infra/` changed)

Use path-based conditionals to avoid deploying unchanged components.

## Implementation Notes

In `.github/workflows/ci.yml`, add a `deploy` job that `needs: [lint, typecheck, test-rust, build]` and only runs on `push` to `main` (not on PRs).

Use GitHub Secrets for:
1. `FLY_API_TOKEN` for Fly.io deployment
2. `CLOUDFLARE_API_TOKEN` for Cloudflare Workers
3. `RELAY_API_KEY` for the alchemy config

Use `dorny/paths-filter` action to detect which components changed and only deploy those.

## Resolution

Added `deploy` job to CI pipeline that runs only on push to main after the build job passes. Uses `dorny/paths-filter@v2` to detect changes in `apps/server/` and `apps/web/`+`packages/infra/`. Server deploys via Fly.io with `FLY_API_TOKEN` secret. Web deploys via Alchemy with `CLOUDFLARE_API_TOKEN` and `RELAY_API_KEY` secrets. Unchanged components are skipped.
