# Add Typing Indicator During LLM Processing

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

Between when a user sends a message and when the first streamed token arrives, there's a dead zone where nothing visually happens. The message is queued, the server picks it up, sends it to OpenRouter, and waits for the first token. This can take 2 to 5 seconds (or longer with cold starts).

During this time, the user has no feedback that their message is being processed. The ThinkingIndicator only shows when `awaitingResponse` is true, but it's subtle and not well-positioned.

## Expected Behavior

Show a clear "Relay is thinking..." indicator:
1. Appears immediately after the user sends a message
2. Shows animated dots or a pulsing indicator below the user's message
3. Replaces with the actual streaming response once tokens arrive
4. Different visual for "waiting in queue" (messages ahead) vs "processing" (currently being handled)

## Implementation Notes

The session status transitions through: `idle` -> `streaming` (when LLM starts). The frontend can use this to show different indicators:

1. When `awaitingResponse && sessionStatus === "idle"`: Show "In queue..." (message sent, waiting for processing)
2. When `sessionStatus === "streaming"` and no assistant message content yet: Show "Thinking..."
3. When assistant message has content: Show the streaming content

This could be a dedicated component placed after the last message in the virtualizer, outside the message list.

## Resolution

Split the thinking indicator into two states based on `sessionStatus`. When `showThinking && sessionStatus === "idle"`, shows "in queue..." with a muted pulsing dot (the message was sent but hasn't started processing yet). When `showThinking && sessionStatus !== "idle"`, shows the existing ThinkingIndicator (LLM is actively generating). The "running tools..." indicator for `waiting_for_tool` status is unchanged. All indicators have `role="status"` for accessibility.
