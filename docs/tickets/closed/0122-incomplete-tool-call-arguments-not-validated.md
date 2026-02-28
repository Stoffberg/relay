# Incomplete Tool Call Arguments Not Validated Before Dispatch

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

In `stream_llm_response`, tool call arguments are accumulated via `push_str()` as streaming chunks arrive. If the SSE stream drops mid-response (network error, timeout, OpenRouter issue), the accumulated arguments can be partial/invalid JSON. The function returns these incomplete arguments in the `ToolCalls` result without any validation.

In `apps/server/src/main.rs` around lines 1142-1159:

The `finish_reason == "tool_calls"` check confirms the LLM intended to call tools, but doesn't verify that each tool call's `arguments` field is valid JSON. Downstream, `dispatch_tool_call` passes these raw arguments to the agent, which then tries to parse them and fails with a confusing error.

## Steps to Reproduce

1. Send a message that triggers a tool call
2. Interrupt the SSE stream from OpenRouter mid-response (e.g., network timeout at 15 seconds)
3. Tool call arguments like `{"path": "/home/us` get dispatched to the agent
4. Agent fails to parse JSON, returns generic error

## Expected Behavior

Before returning `ToolCalls`, validate that each tool call has:
1. Non-empty `id`
2. Non-empty `function.name`
3. Valid JSON in `function.arguments` (at minimum, parseable by `serde_json::from_str`)

If validation fails, return `TextComplete` with the accumulated text content instead, and log a warning about the malformed tool calls.

## Resolution

Added validation before returning ToolCalls from stream_llm_response. Each tool call must have a non-empty id, non-empty function name, and valid JSON arguments. If any fail validation, falls back to TextComplete with the accumulated text and logs a warning. Server deployed.

