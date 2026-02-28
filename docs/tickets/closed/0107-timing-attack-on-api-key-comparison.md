# Timing Attack on API Key Comparison

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

The API key comparison in `chat_handler` uses standard string equality (`==`), which is vulnerable to timing attacks. An attacker can measure response times to infer the correct key character by character, since `==` short circuits on the first mismatched byte.

In `apps/server/src/main.rs` around line 412:

```rust
.map(|token| token == state.api_key)
```

## Expected Behavior

Use constant time comparison so the duration is identical regardless of how many characters match. The `subtle` crate provides `ConstantTimeEq` for this, or a fixed time comparison can be done by hashing both values with a fast hash and comparing the digests.

## Implementation Notes

Option A: Add the `subtle` crate and use `ct_eq` on byte slices.
Option B: Hash both the provided token and `state.api_key` with SHA-256 (already available via dependencies) and compare the hashes. This is simpler and avoids a new dependency.

## Resolution

Replaced the == comparison with a constant time XOR+fold comparison. Both byte slices are compared in full (length check first, then XOR each byte with bitwise OR accumulation). No new dependencies needed. Server deployed.

