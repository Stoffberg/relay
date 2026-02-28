# Add aria-live Regions for Streaming and Status Updates

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

Screen reader users get no announcements when:
1. A new assistant message starts streaming
2. The AI finishes responding
3. Tool calls start/complete
4. The session status changes (idle, streaming, waiting_for_tool, error)
5. The connection status changes

Dynamic content updates via SpacetimeDB subscriptions are completely invisible to assistive technology.

## Expected Behavior

Add `aria-live` regions for key status updates:

1. **Streaming status**: An `aria-live="polite"` region that announces "Relay is responding..." when streaming starts and "Response complete" when it finishes
2. **Tool execution**: Announce "Running tool: shell_exec" when tools start and "Tool completed" when done
3. **Connection status**: An `aria-live="assertive"` region for connection changes ("Connection lost", "Reconnecting...", "Connected")
4. **Error messages**: `aria-live="assertive"` for error states

## Implementation Notes

Add a visually hidden status announcer component at the root level:

```tsx
<div aria-live="polite" className="sr-only">
  {statusMessage}
</div>
```

Update `statusMessage` whenever significant state changes occur. Use `sr-only` (Tailwind class for screen-reader-only) to hide it visually while keeping it accessible.

For the streaming indicator specifically, add `role="status"` to the thinking indicator component.

## Resolution

Added `aria-live="polite"` visually hidden region in the chat area that announces "Relay is responding" (streaming), "Running tools" (waiting_for_tool), and "Response complete" (idle after messages). Added `role="status"` and `aria-label="Relay is thinking"` to the ThinkingIndicator component.
