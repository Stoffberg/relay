# Session ID Accepts Any String Including Special Characters

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The server's `chat_handler` validates session ID length (rejects if > 500 chars, per ticket 0003) but does not validate the format or content of the session ID. Any string is accepted, including:

- Path traversal sequences: `../../etc`
- Null bytes: `test\x00null`
- Newlines: `test\ninjection`
- SQL-like patterns: `'; DROP TABLE session; --`
- Unicode control characters
- Empty string (if under length limit)

While SpacetimeDB is not vulnerable to SQL injection (it uses typed queries), storing arbitrary strings as primary keys can cause issues in logging (log injection via newlines), URL routing (special chars break URLs), and display (control characters corrupt UI).

Live testing confirmed the server accepts `test/../../../etc` as a session_id (blocked only by auth, not by validation).

## Expected Behavior

Validate session ID format:
1. Must match a pattern like `[a-zA-Z0-9-_]` (alphanumeric plus dashes and underscores)
2. Must not be empty
3. Must be at most 100 characters (the current 500 limit is too generous)

```rust
if !session_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
    return error("Invalid session ID format");
}
```

## Resolution

Added session ID format validation in `chat_handler`. Session IDs must be 1 to 100 characters and contain only alphanumeric characters, dashes, and underscores. Rejects empty strings, path traversal sequences, null bytes, newlines, and any special characters with a 400 response. Deployed and verified: `../../etc/passwd` is rejected with a clear error message.

