# Add Streaming Response Option to /chat Endpoint

**Type:** feature
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The `/chat` endpoint returns immediately with a message_id and session_id. The actual response is delivered asynchronously via SpacetimeDB subscriptions. This architecture works well for the web frontend but makes it difficult to:

1. Build CLI clients that want streaming responses
2. Integrate with other tools that expect HTTP streaming
3. Test the API with curl and see results immediately
4. Build mobile apps without SpacetimeDB SDK support

## Expected Behavior

Add an optional `stream=true` query parameter or header to `/chat` that makes the endpoint return a Server-Sent Events (SSE) stream:

```bash
curl -N -X POST https://code-api.stoff.dev/chat?stream=true \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"message": "Hello", "session_id": "test"}'
```

Response is an SSE stream:
```
data: {"type": "text", "content": "Hello"}
data: {"type": "text", "content": "! How"}
data: {"type": "text", "content": " can I help?"}
data: {"type": "done", "message_id": "..."}
```

## Implementation Notes

The server already streams from OpenRouter internally. The streaming option would:
1. Keep the HTTP connection open
2. Forward message_part content as SSE events in real time
3. Forward tool call events as structured SSE events
4. Send a `done` event when the session returns to idle

This would use Axum's SSE support:
```rust
Sse::new(stream.map(|part| Event::default().data(part)))
```

The SpacetimeDB subscription architecture remains the primary delivery mechanism. The SSE stream is an alternative for clients that prefer HTTP.

## Resolution

Added `POST /chat/stream` endpoint that accepts the same JSON body as `/chat` but returns a Server Sent Events stream. The stream emits `{"type":"text","content":"..."}` events for each message_part as it arrives, `{"type":"tool","tool_name":"...","status":"...","output":"..."}` for completed tool calls, `{"type":"error","message":"..."}` for session errors, and `{"type":"done","message_id":"..."}` when the response is complete. Uses a 100ms polling interval against SpacetimeDB's in-memory cache. Keepalive is enabled for long-running connections.

Usage: `curl -N -s -X POST https://code-api.stoff.dev/chat/stream -H "Content-Type: application/json" -d '{"message":"Hello","session_id":"test"}'`
