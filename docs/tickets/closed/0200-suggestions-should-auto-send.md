# Suggestion Chips Should Auto-Send on Click

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The empty state suggestion chips in `chat.$sessionId.tsx` call `setInput(s)` which fills the input textarea but does not send the message. The user has to click a suggestion, then press Enter. This is a confusing two-step interaction when every other chat app sends suggestion chips immediately on click.

In `apps/web/src/routes/chat.$sessionId.tsx` around line 219:

```typescript
onClick={() => onSuggestion(s)}
```

Where `onSuggestion` is just `setInput`.

## Expected Behavior

Clicking a suggestion should send it immediately:

```typescript
const onSuggestion = (text: string) => {
    setInput(text);
    sendMessage(text);
};
```

Or show the text briefly in the input (100ms delay) then auto-send, so the user sees what's being sent.

## Resolution

Refactored `sendMessage` into a `doSend(text: string)` function that accepts text directly. The `EmptyState` component now receives `doSend` instead of `setInput`, so clicking a suggestion chip immediately sends the message without requiring a second Enter press. Deployed to Cloudflare Workers.

