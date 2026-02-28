# send_message Error Response Leaks SpacetimeDB Internals

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

When the `send_message` reducer call fails, the server returns the raw error in the HTTP response: `format!("Failed to create user message: {e}")`. The `{e}` here is the SpacetimeDB SDK error which can contain internal details about the reducer, table structure, or connection state.

Note: ticket 0136 (closed) addressed error response leaks from serde deserialization. This is a separate leak path through the reducer call failure.

## Steps to Reproduce

1. Trigger a `send_message` reducer failure (e.g., SpacetimeDB briefly disconnected)
2. The 500 response contains the raw SpacetimeDB error string
3. Error may include module names, table names, or internal error codes

## Expected Behavior

Return a generic error like `"Failed to send message. Please try again."` and log the actual error server-side.

## Implementation Notes

Replace the `format!("Failed to create user message: {e}")` with a generic message. Log `e` at error level for debugging.

## Resolution

Replaced the format string that included the raw SpacetimeDB error with a generic "Failed to send message. Please try again." response. The actual error is now logged server-side via `tracing::error!` for debugging while keeping internal details out of client responses.
