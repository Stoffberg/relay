# Tool Calls Silently Dropped When finish_reason Is "stop"

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

In `stream_llm_response`, if the LLM stream includes both text content and tool_calls in the delta chunks but the final `finish_reason` is `"stop"` instead of `"tool_calls"`, the accumulated tool calls are silently discarded and only the text content is returned as `TextComplete`.

In `apps/server/src/main.rs` around line 1153-1159:

```rust
if finish_reason.as_deref() == Some("tool_calls") && !tool_calls.is_empty() {
    Ok(LLMResult::ToolCalls { text: full_text, tool_calls })
} else {
    Ok(LLMResult::TextComplete(full_text))
}
```

This can happen if OpenRouter or the model has a bug where it emits tool call deltas but then signals completion with `"stop"` instead of `"tool_calls"`.

## Expected Behavior

If `tool_calls` is non-empty (after filtering out empty placeholders), return `ToolCalls` regardless of the `finish_reason` value. The presence of tool calls in the stream is a stronger signal than the finish reason.

## Implementation Notes

Change the condition to:

```rust
if !tool_calls.is_empty() {
    Ok(LLMResult::ToolCalls { text: full_text, tool_calls })
} else {
    Ok(LLMResult::TextComplete(full_text))
}
```

Log a warning if `finish_reason` doesn't match what was returned, for debugging OpenRouter behavior.

## Resolution

Changed the condition to check `!tool_calls.is_empty()` regardless of `finish_reason`. If tool calls are present but the finish reason is not `"tool_calls"`, a warning is logged for diagnostics but the tool calls are still processed.

