# Unbounded Tool Call Index Can Exhaust Server Memory

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-26

## Description

In `stream_llm_response` (line 909 of `apps/server/src/main.rs`), when processing SSE chunks from OpenRouter, tool call deltas include an `index` field. The code does:

```rust
while tool_calls.len() <= idx {
    tool_calls.push(ToolCall::default());
}
```

If a malformed or malicious SSE chunk arrives with `index: 999999`, this loop pushes 1 million empty `ToolCall` structs into the vec before inserting at the target index. This is an unbounded memory allocation.

## Steps to Reproduce

1. If OpenRouter (or a MITM) sends an SSE chunk with `tool_calls[0].index = 999999`
2. Server allocates ~1M ToolCall objects
3. Memory spike, potential OOM

## Expected Behavior

Validate the tool call index against a reasonable maximum before extending the vector. Something like:

```rust
if idx > 50 {
    return Err(anyhow!("tool call index {} exceeds maximum", idx));
}
```

50 is generous; most LLM responses have 1 to 5 tool calls.

## Implementation Notes

In `apps/server/src/main.rs` around line 909, add an index bounds check before the `while` loop. Return an error or break the stream if the index is unreasonable.

## Resolution

Added bounds check before the tool call index extension loop in stream_llm_response. If idx exceeds 50, returns an error immediately ('Tool call index N exceeds maximum of 50'). This prevents malformed SSE chunks from causing unbounded memory allocation while still being generous enough for any real LLM response.
