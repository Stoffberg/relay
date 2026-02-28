# No Retry on OpenRouter Rate Limit (429)

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

When OpenRouter returns 429 (rate limit), the server immediately fails the request and passes the error to the user. There's no retry with exponential backoff. OpenRouter 429 responses typically include a `Retry-After` header indicating how long to wait.

This is especially problematic during bursts: if 5 messages are queued and processing, each one hits OpenRouter back to back. If OpenRouter rate limits after the 3rd, messages 4 and 5 fail even though waiting a few seconds would have allowed them to succeed.

## Expected Behavior

Implement retry with exponential backoff for 429 and 5xx responses from OpenRouter:

1. On 429: Read `Retry-After` header, wait that duration, then retry (max 3 retries)
2. On 500/502/503: Wait 2s, then 4s, then 8s (max 3 retries)
3. On other errors: Fail immediately (no retry)

## Implementation Notes

In `apps/server/src/main.rs`, in `stream_llm_response`, wrap the HTTP request in a retry loop:

```rust
let mut retries = 0;
let response = loop {
    let res = client.post(url).json(&request).send().await?;
    if res.status() == 429 && retries < 3 {
        let wait = res.headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(2u64.pow(retries));
        tracing::warn!("OpenRouter rate limited, retrying in {wait}s");
        tokio::time::sleep(Duration::from_secs(wait)).await;
        retries += 1;
        continue;
    }
    break res;
};
```

## Resolution

Wrapped the OpenRouter HTTP request in a retry loop. On 429 responses, reads the Retry-After header (falls back to exponential backoff: 1s, 2s, 4s). On 5xx responses, retries with exponential backoff. Max 3 retries. Non-retryable errors fail immediately with sanitized user messages.
