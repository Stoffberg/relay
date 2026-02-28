# Add Security Headers to Server HTTP Responses

**Type:** task
**Severity:** medium
**Component:** server
**Reported:** 2026-02-26

## Description

The server at `code-api.stoff.dev` returns no security headers beyond CORS. Missing headers include:

1. `X-Content-Type-Options: nosniff` (prevents MIME type sniffing)
2. `X-Frame-Options: DENY` (prevents clickjacking)
3. `Strict-Transport-Security: max-age=31536000` (forces HTTPS)
4. `Content-Security-Policy` (prevents XSS, though this is an API server)
5. `X-Request-ID` (useful for debugging/tracing)

While this is an API server (not serving HTML), security headers are still best practice and some security scanners will flag their absence.

## Expected Behavior

Add a middleware layer in Axum that sets these headers on all responses.

## Implementation Notes

In `apps/server/src/main.rs`, add a `tower_http::set_header` middleware or a custom layer:

```rust
use axum::http::header;

let app = Router::new()
    .route("/health", get(health))
    .route("/chat", post(chat_handler))
    .layer(cors_layer)
    .layer(
        tower_http::set_header::SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ),
    )
    // ... more headers
```

Or use a single custom middleware that sets all headers at once.

## Resolution

Added three security headers via tower-http SetResponseHeaderLayer on the Axum router: X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Strict-Transport-Security: max-age=31536000; includeSubDomains. Required adding 'set-header' feature to tower-http dependency. Verified all three headers appear in responses.
