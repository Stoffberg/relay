# Add Last Message Preview to Sidebar Sessions

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The sidebar shows session title and message count, but no preview of the most recent message. Users can't distinguish between conversations without clicking into each one. Every chat app (iMessage, WhatsApp, ChatGPT, Claude) shows a truncated preview of the last message.

## Expected Behavior

Show a one-line truncated preview of the last message below the session title:

```
Session Title
You: Can you help me with...        2m ago
```

The preview should be the first ~60 characters of the last message's content (user or assistant), truncated with ellipsis. Include the role ("You:" or "AI:") and a relative timestamp.

## Implementation Notes

The session table already has `updatedAt`. For the preview content, either:
1. Add a `last_message_preview` field to the `session` table (updated by the server when a message completes)
2. Or query the latest message from the SpacetimeDB cache per session (only viable if subscriptions are scoped, per ticket 0192)

Option 1 is better because it works with the tier-1 subscription (sessions only) from ticket 0192, without needing to load all messages just for previews.

## Resolution

Added `lastMessage` field to `SessionPreview` populated from the latest message in the SpacetimeDB cache. Shows "You: ..." or "AI: ..." truncated to 60 chars below each session title. Uses `getPartsForMessage` to get content of the latest message by createdAt timestamp.

