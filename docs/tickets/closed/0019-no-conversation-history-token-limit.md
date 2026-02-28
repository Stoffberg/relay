# No Token Limit on Conversation History

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-26

## Description

The `fetch_history` function in `apps/server/src/main.rs` includes every complete message in the conversation when building the LLM request. There is no token counting, no history windowing, and no truncation.

For long conversations (50+ messages with tool outputs), the total token count can easily exceed the model's context window. When this happens, OpenRouter returns an error that gets passed to the user as "OpenRouter returned 400: ..." (see ticket 0018).

This is especially problematic because:
1. Tool outputs can be up to 30,000 characters each
2. A conversation with 10 tool calls could easily hit 300K+ characters
3. Claude 3.5 Sonnet has a 200K token context window, but that includes the response

## Expected Behavior

Implement a sliding window or summarization strategy:

1. **Simple approach**: Count approximate tokens (chars / 4 is a rough estimate). If history exceeds 80% of the model's context window, drop oldest messages (keeping the system prompt and first user message for context).

2. **Better approach**: Track token counts per message (OpenRouter returns usage info). When building history, include messages from most recent backward until hitting a token budget.

3. **Best approach**: When history is too long, summarize older messages into a condensed "conversation so far" message, then include recent messages in full.

## Implementation Notes

In `apps/server/src/main.rs`, in `fetch_history` or `run_agent_loop`:

1. After building the full history, estimate total tokens
2. If over budget (e.g., 150K tokens for a 200K context model), truncate from the front
3. Add a marker message like `[Earlier conversation omitted for context window]` so the LLM knows history was trimmed
4. Consider making the token budget configurable via env var

## Resolution

Added character-based history windowing in run_agent_loop. After fetching history, estimates total content size. If over 600K chars (~150K tokens), drops oldest messages and prepends a marker '[Earlier conversation history omitted to fit context window]'. Keeps the most recent messages that fit within budget. Simple and effective without needing actual token counting.
