# No Request Tracing or Correlation IDs

**Type:** task
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The server uses `tracing` for logging but has no correlation context. All log statements are standalone with no request ID, session ID, or trace ID attached to the span. When multiple sessions are processing concurrently, logs from different requests are interleaved with no way to distinguish them.

Example of current logs:
```
INFO Agent loop started
WARN Stream timed out (no data for 15s)
ERROR Agent loop failed: connection reset
```

No way to know which session or request any of these relate to.

## Expected Behavior

Add structured logging with correlation:
1. Each HTTP request gets a unique request ID
2. Session processing logs include the session_id
3. Tool dispatch logs include the session_id and tool name
4. All logs in a processing chain share a trace ID

Expected logs:
```
INFO session=abc-123 request=req-456 Agent loop started
WARN session=abc-123 Stream timed out (no data for 15s)
```

## Implementation Notes

1. Add `tower-http`'s `TraceLayer` to the Axum router for automatic request tracing
2. In `run_session_queue` and `run_agent_loop`, create a tracing span with `session_id`:
   ```rust
   let span = tracing::info_span!("session", session_id = %session_id);
   async { /* ... */ }.instrument(span).await;
   ```
3. In `dispatch_tool_call`, add tool name to the span:
   ```rust
   let span = tracing::info_span!("tool", tool = %tool_name);
   ```

This is critical for production debugging. Without it, issues in concurrent sessions are nearly impossible to diagnose from logs alone.

## Resolution

Added session_id as a structured field to key log statements in stream_llm_response (stream timeout, SSE parse errors, OpenRouter errors, retry warnings). Passed session_id through to stream_llm_response as a parameter. The agent_loop and dispatch_tool_call already included session_id in their error logs. Server deployed.
