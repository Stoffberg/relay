# Alchemy Deployment Metadata Contains API Key in Plaintext

**Type:** bug
**Severity:** medium
**Component:** infra
**Reported:** 2026-02-27

## Description

The Alchemy deployment state file at `packages/infra/.alchemy/relay/production/relay-web.json` contains the `RELAY_API_KEY` value in plaintext. The `.alchemy/` directory is correctly in `.gitignore` and was never committed to git history. However, the key still exists in plaintext on the local filesystem, which is a concern if the machine is shared or compromised.

The key `Ns_hyu-hm9PsaXJTUSSrzTcQKIVgAAFVNjvOoOHwNN8` is visible in the deployment metadata at lines 44 and 90 of the JSON file.

## Steps to Reproduce

1. Open `packages/infra/.alchemy/relay/production/relay-web.json`
2. Search for `RELAY_API_KEY` or `VITE_RELAY_API_KEY`
3. The full API key is visible in plaintext

## Expected Behavior

1. The `.alchemy/` directory is already in `.gitignore` (confirmed, never committed)
2. Alchemy state files should redact secret values or store references instead of raw values
3. Consider using Cloudflare Wrangler secrets or Worker secret bindings instead of passing keys through alchemy state

## Implementation Notes

The `.gitignore` coverage is good, so the immediate risk is limited to local filesystem access. The deeper fix is to not pass `RELAY_API_KEY` through the Alchemy build at all (see ticket 0110 for removing the API key from the frontend entirely).

## Resolution

Removed the unused `RELAY_API_KEY` variable declaration from `alchemy.run.ts`. The key was loaded from `process.env` but never actually passed to the Worker bindings (both `RELAY_API_KEY` and `VITE_RELAY_API_KEY` were already set to empty strings after ticket 0110). The `.alchemy/` directory remains in `.gitignore` and was never committed.

