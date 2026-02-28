# Add Token Usage Tracking

**Type:** feature
**Severity:** medium
**Component:** server, web
**Reported:** 2026-02-27

## Description

There's no visibility into token usage or cost. Users don't know how many tokens each conversation uses, what the total spend is, or when they're approaching context window limits.

OpenRouter returns usage information in the streaming response (prompt_tokens, completion_tokens, total_tokens) but this data is currently ignored by the server.

## Expected Behavior

1. **Track per-message token usage**: Store prompt_tokens and completion_tokens for each assistant message
2. **Show per-session totals**: Display total tokens used in the session header or sidebar
3. **Show cost estimate**: Multiply tokens by the model's per-token cost (available from OpenRouter)
4. **Warn on context window**: Show a warning when conversation history approaches the model's context limit

## Implementation Notes

### Schema
Add `prompt_tokens: Option<u64>` and `completion_tokens: Option<u64>` to the `Message` table. Or create a separate `message_usage` table to avoid schema changes on the core table.

### Server
In `stream_llm_response`, parse the final SSE chunk's `usage` field (OpenRouter includes this in the `[DONE]` or final data chunk). Store the token counts via a new reducer.

### Frontend
Show token counts in the sidebar (per session total) and optionally per message on hover. Calculate estimated cost based on model pricing.

### Bonus
Add a daily/monthly usage summary accessible from the command palette.

## Resolution

Added `prompt_tokens: Option<u64>` and `completion_tokens: Option<u64>` fields to the Message table. Added `set_message_tokens` reducer. Server now parses the `usage` object from OpenRouter SSE chunks and stores token counts after each LLM call via the reducer. Added `TokenUsage` struct and threaded it through `LLMResult` variants.

Frontend shows per-session token totals in the chat header (e.g., "3 msg · 1.2k tok") with compact formatting (k/M suffixes). Per-message token counts appear on hover next to the Copy and Regen buttons on assistant messages, with a title tooltip showing the prompt/completion breakdown.
