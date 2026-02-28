# fetch_history Returns Empty Content During Partial Message Writes

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

In `fetch_history`, if a message record exists in the SpacetimeDB cache but its `message_part` rows haven't arrived yet (due to subscription lag), the function returns that message with empty content. This empty content is then included in the LLM conversation history, which can confuse the model.

In `apps/server/src/main.rs` around line 708-713:

When `content_by_msg` doesn't contain the message ID, `unwrap_or_default()` returns an empty string. The message is still included in the history with `content: ""`.

This race condition is most likely during streaming: a message is marked "complete" but its parts are still propagating through SpacetimeDB subscriptions.

## Steps to Reproduce

1. Send multiple messages rapidly to a session
2. The server processes them sequentially but `fetch_history` runs between completions
3. A message that was just marked "complete" appears in history with empty content
4. The LLM sees an empty assistant message, which may affect response quality

## Expected Behavior

Skip messages with empty content from the history, or add a brief delay/retry when a "complete" message has no parts. At minimum, log a warning when this happens.

## Resolution

Already handled by existing code. In `fetch_history`, user messages with empty text are skipped by the `if !text.is_empty()` check at line 834. For assistant messages, the `if msg_tool_calls.is_empty()` branch also skips messages with empty text (line 777: `if !text.is_empty()`). Messages with tool calls but no text still get included (correctly) since the tool calls themselves are meaningful. The race window is also mitigated by the 200ms sleep between processing messages in `run_session_queue`, which gives subscription updates time to propagate.

