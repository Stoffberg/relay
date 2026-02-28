# History Trimming Can Break Tool Call/Result Pairs

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

The conversation history truncation in `fetch_history` cuts from the front based on a 600,000 character budget. It removes messages one at a time until the total is under budget. However, it doesn't check for tool call/result pair integrity.

If an assistant message with `tool_calls` is kept but the subsequent `tool` role messages are trimmed (or vice versa), the resulting conversation has orphaned tool calls or results. The OpenRouter/LLM API will reject this as an invalid conversation format, causing the request to fail.

## Steps to Reproduce

1. Have a very long conversation (>600K chars of history) that includes tool calls
2. The trimming removes messages from the front
3. If a tool call/result boundary falls at the trim point, the conversation becomes invalid
4. The next LLM request fails with a format error

## Expected Behavior

History trimming should preserve the integrity of tool call sequences. When trimming, if an assistant message with `tool_calls` is removed, all subsequent `tool` role messages for those calls should also be removed. Conversely, if keeping a `tool` role message, the preceding assistant message with the matching `tool_calls` must also be kept.

## Implementation Notes

After trimming, scan the remaining messages for orphaned tool calls/results and remove them. Or trim in logical units (user turn + assistant turn + any tool calls/results) rather than individual messages.

## Resolution

Added a post-trim cleanup pass that builds sets of tool call IDs and tool result IDs present in the remaining messages. `tool` role messages without a matching assistant `tool_calls` entry are removed, and assistant messages with `tool_calls` but no matching `tool` results are removed (unless they also have text content). This preserves tool call/result pair integrity after history truncation.
