# Error Responses Leak Internal Deserialization Details

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

When the server receives malformed JSON or requests with missing/wrong-typed fields, the error responses include internal Rust deserialization details that expose the API's type structure, field names, and parsing positions.

Examples from live testing:

- Invalid JSON body returns: `"Failed to parse the request body as JSON: expected ident at line 1 column 2"`
- Missing field returns: `"Failed to deserialize the JSON body into the target type: missing field 'session_id' at line 1 column 20"`
- Wrong type returns: `"Failed to deserialize the JSON body into the target type: message: invalid type: null, expected a string at line 1 column 16"`

These messages reveal:
1. The server uses JSON deserialization (likely serde)
2. Exact field names expected in the request body
3. Expected types for each field
4. Internal parsing positions

## Steps to Reproduce

1. `POST /chat` with body `not json at all` returns 400 with serde parse error
2. `POST /chat` with body `{"message": "hello"}` returns 422 with field enumeration
3. `POST /chat` with body `{"message": null, "session_id": "x"}` returns 422 with type info

## Expected Behavior

Return generic error messages that don't expose internals:

- Invalid JSON: `{"error": "Invalid request body"}`
- Missing field: `{"error": "Missing required field"}`
- Wrong type: `{"error": "Invalid request format"}`

Optionally include a machine-readable error code for client developers without revealing implementation details.

## Implementation Notes

Axum allows custom error extractors via `JsonRejection` handling. Implement a custom `Json` extractor that maps all deserialization errors to generic messages, or add a middleware that intercepts 400/422 responses and sanitizes the body.

## Resolution

Changed `chat_handler` to accept `Result<Json<ChatRequest>, JsonRejection>` instead of `Json<ChatRequest>`. All JSON deserialization failures (malformed JSON, missing fields, wrong types) now return a generic `{"error": "Invalid request body"}` with HTTP 400, hiding serde internals. Verified live: sending `not json` returns the generic error instead of parse position details.

