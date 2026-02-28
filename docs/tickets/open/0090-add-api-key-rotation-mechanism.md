# Add API Key Rotation Mechanism

**Type:** task
**Severity:** medium
**Component:** server, infra
**Reported:** 2026-02-27

## Description

The `RELAY_API_KEY` is a single static key set via Fly.io secrets. If the key is compromised, there's no way to rotate it without:
1. Updating the Fly.io secret (requires deploy)
2. Updating the Cloudflare Worker env (requires deploy)
3. Downtime while both deploys happen

Additionally, the key is exposed to the frontend via `VITE_RELAY_API_KEY`, meaning it's visible in the browser's JavaScript bundle. Anyone who inspects the network requests or JavaScript can extract the key.

## Expected Behavior

1. **Support multiple valid keys**: Accept an array of keys so a new key can be added before the old one is revoked. This enables zero-downtime rotation.
2. **Move auth server side**: Instead of the frontend sending the API key directly, use a session cookie based auth flow. The frontend authenticates once (login), gets an HTTP-only cookie, and subsequent requests are authenticated via cookie. The API key stays server side only.

## Implementation Notes

### Phase 1: Multiple Keys
Accept comma-separated keys in `RELAY_API_KEY`:
```rust
let valid_keys: HashSet<String> = std::env::var("RELAY_API_KEY")
    .map(|k| k.split(',').map(|s| s.trim().to_string()).collect())
    .unwrap_or_default();
```

### Phase 2: Cookie Auth
1. Add a `/login` endpoint that validates credentials and sets an HTTP-only secure cookie
2. Validate the cookie in `chat_handler` alongside (or instead of) the Bearer token
3. Remove `VITE_RELAY_API_KEY` from the frontend entirely

Phase 2 is more work but eliminates the key exposure issue entirely.

## Resolution

_(fill in when resolving)_
