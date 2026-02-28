# SSE Parse Errors Silently Ignored

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

In the SSE stream parsing logic in `apps/server/src/main.rs`, when `serde_json::from_str` fails on an SSE data chunk, the error is silently ignored and the chunk is skipped. This means malformed responses from OpenRouter are invisible in logs.

If OpenRouter changes their response format, or sends an error mid-stream, the server will silently ignore chunks without any indication that data was lost. The LLM response will appear truncated or garbled without any error trail.

## Expected Behavior

Log a warning when SSE parsing fails:

```rust
if let Err(e) = serde_json::from_str::<SSEChunk>(&data) {
    tracing::warn!("Failed to parse SSE chunk: {e}. Data: {}", &data[..data.len().min(200)]);
    continue;
}
```

Truncate the logged data to avoid flooding logs with large chunks, but include enough to diagnose the issue.

## Implementation Notes

In the SSE parsing loop in `stream_llm_response`, add a `tracing::warn!` before the `continue` on parse failure. Include the first 200 characters of the failed data chunk for debugging context.

Also consider tracking the count of failed parses and logging a summary at the end of the stream if any occurred.

## Resolution

Changed SSE parsing from silent if let Ok to explicit match with Err arm that logs a warning via tracing::warn! with the first 200 chars of the failed data chunk and the session_id. Server deployed.
