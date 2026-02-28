# Input Bar Has No Maximum Length Limit

**Type:** bug
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The textarea in the input bar has no `maxLength` attribute. A user can paste unlimited text (megabytes of content from clipboard), which will:
1. Slow down the browser as the textarea renders the content
2. Send a huge payload to the server (which does validate message length, per ticket 0003)
3. Cause the height calculation to lag behind the paste event

The server-side validation (ticket 0003, closed) prevents oversized messages from being stored, but the frontend gives no feedback until the server rejects the request.

## Expected Behavior

Add a client-side length limit that matches the server's validation:

```typescript
<textarea maxLength={100000} ... />
```

Or show a character count and disable the send button when the limit is exceeded, with a message like "Message too long (max 100,000 characters)".

## Resolution

Added `maxLength={100000}` to the textarea in input-bar.tsx. This prevents the browser from accepting more than 100K characters, matching the server's validation and avoiding large payload issues before the request is even sent.

