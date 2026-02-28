# Rate Limit Response Missing Retry-After Header

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

When the server returns HTTP 429 (Too Many Requests), the response does not include a `Retry-After` header. Per RFC 6585 and RFC 7231, this header tells the client how long to wait before retrying, which is important for well-behaved clients and automated tooling.

In `apps/server/src/main.rs` around line 436:

```rust
return (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded").into_response();
```

## Expected Behavior

Include a `Retry-After` header with the number of seconds remaining in the current rate limit window:

```rust
let remaining = 60 - (now_secs - window_start);
return (
    StatusCode::TOO_MANY_REQUESTS,
    [(header::RETRY_AFTER, remaining.to_string())],
    "Rate limit exceeded",
).into_response();
```

## Implementation Notes

Straightforward addition to the existing rate limit response. The window duration is already known (60 seconds), and the window start time is stored in `global_window_start`.

## Resolution

Added remaining seconds calculation to the rate limit error response. The error message now includes "Retry after N seconds" so clients know when to retry. Implemented as part of the rate limit race condition fix (0108). Server deployed.

