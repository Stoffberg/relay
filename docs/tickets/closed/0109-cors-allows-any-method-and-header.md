# CORS Allows Any HTTP Method and Header

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

The CORS configuration in `main.rs` uses `AllowMethods::any()` and `AllowHeaders::any()`, which permits all HTTP methods (DELETE, PATCH, PUT, etc.) and all headers from any allowed origin. This is overly permissive for an API that only uses POST and GET.

In `apps/server/src/main.rs` around lines 369-370:

```rust
.allow_methods(AllowMethods::any())
.allow_headers(AllowHeaders::any())
```

## Expected Behavior

Restrict CORS to only the methods and headers the API actually uses:

```rust
.allow_methods([Method::GET, Method::POST, Method::OPTIONS])
.allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
```

## Implementation Notes

Straightforward change in the CORS builder. No downstream impact since the frontend only sends POST with Content-Type and Authorization headers.

## Resolution

Restricted CORS methods to GET, POST, OPTIONS and headers to Content-Type and Authorization. Removed AllowMethods::any() and AllowHeaders::any(). Server deployed.

