# Reducers Accept Unbounded String Fields

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

Multiple SpacetimeDB reducers accept string parameters with no length validation. A malicious or buggy client can send arbitrarily large strings that consume database storage and memory:

- `update_session_title`: title can be megabytes
- `fail_message`: error string unbounded
- `append_message_part`: content unbounded
- `create_tool_command`: tool_args unbounded
- `create_tool_result`: output and error strings unbounded
- `register_agent`: name unbounded

These strings are stored in SpacetimeDB and returned to all subscribers, meaning one large write affects every connected client.

## Expected Behavior

Add length validation to all string inputs:

```rust
if title.len() > 200 {
    return Err("Title exceeds maximum length of 200 characters".to_string());
}
```

Suggested limits:
- Session title: 200 chars
- Agent name: 100 chars
- Error messages: 10,000 chars
- Message part content: 100,000 chars
- Tool args: 50,000 chars
- Tool output/result: 50,000 chars (already truncated server-side at 30,000, but not enforced in reducer)

## Resolution

Added string length validation via a shared `check_len` helper to all relevant reducers. Limits: session title 200, agent name 100, error messages 10K, message part content 100K, tool args 50K, tool output 50K. Reducers now return descriptive errors when limits are exceeded.

