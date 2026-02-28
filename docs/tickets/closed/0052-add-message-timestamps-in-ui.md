# Add Message Timestamps in Chat UI

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

Messages in the chat UI show no timestamps. Users can't tell when a message was sent or how long ago a conversation happened. This is especially confusing when returning to an old conversation.

## Expected Behavior

Show timestamps on messages:
1. **On hover**: Show the exact time (e.g., "2:34 PM") as a tooltip or a subtle label that appears on hover
2. **Date separators**: Between messages on different days, show a date divider (e.g., "Today", "Yesterday", "Feb 25")
3. **Relative time on old messages**: For messages older than 24 hours, show relative time (e.g., "2 days ago")

Keep it subtle. Timestamps shouldn't dominate the visual hierarchy.

## Implementation Notes

Messages already have `created_at` timestamps from SpacetimeDB. The `extractTimestamp()` helper converts them to milliseconds.

For date separators in the virtualizer, insert virtual "separator" items between messages that cross day boundaries. The virtualizer already handles variable height items, so this should work.

For hover timestamps, add a `title` attribute or a custom tooltip to each message row:

```tsx
<time className="text-xs text-dim opacity-0 group-hover:opacity-100" dateTime={isoString}>
  {formatTime(timestamp)}
</time>
```

## Resolution

Added `createdAt` field to `ChatMessage` interface, populated from SpacetimeDB timestamps via `extractTimestamp()`. Messages now show time on hover via `title` attribute (e.g. "2:34 PM" for today, "Feb 25, 2:34 PM" for older). Added `formatMessageTime()` helper in message-row.tsx.
