# Memoize MessageRow Component

**Type:** task
**Severity:** medium
**Component:** web
**Reported:** 2026-02-26

## Description

`apps/web/src/components/message-row.tsx` is not wrapped in `React.memo`. Since messages are rendered inside a virtualizer, every scroll event or new message causes all visible MessageRow components to re-render, even when their content hasn't changed.

For long conversations (50+ messages), this creates noticeable jank during scrolling and streaming.

## Expected Behavior

Wrap `MessageRow` in `React.memo` with a custom comparison function that checks:
1. `message.id` (identity)
2. `message.status` (streaming vs complete)
3. `content` string (for streaming updates)
4. `toolCalls` array length and status (for tool call updates)

This ensures:
1. Completed messages never re-render
2. Streaming messages re-render only when content changes
3. Tool call messages re-render only when status changes

## Implementation Notes

In `apps/web/src/components/message-row.tsx`:

```tsx
export const MessageRow = React.memo(function MessageRow(props: MessageRowProps) {
  // existing component body
}, (prev, next) => {
  return prev.message.id === next.message.id
    && prev.message.status === next.message.status
    && prev.content === next.content
    && prev.toolCalls?.length === next.toolCalls?.length;
});
```

Also consider memoizing the `markdown-content.tsx` render to avoid re-parsing unchanged markdown.

## Resolution

Wrapped MessageRow in React.memo. Since the component uses useSyncExternalStore internally and receives stable id/store props, the memo prevents unnecessary re-renders from parent changes while the store subscription handles data updates.
