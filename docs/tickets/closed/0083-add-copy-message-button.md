# Add Copy Message Button to Chat Messages

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

Users often want to copy an AI response to paste elsewhere. Currently, they have to manually select the text, which is tricky with code blocks and formatted markdown. There's no one-click copy button for messages.

Code blocks have copy buttons (via markdown-content.tsx), but there's no way to copy an entire message including all its text and code.

## Expected Behavior

Add a copy button that appears on hover over each assistant message:
1. Small icon button in the top-right corner of the message
2. Copies the raw markdown content (not the rendered HTML)
3. Shows a brief checkmark confirmation after copying
4. Only appears on complete messages (not while streaming)

## Implementation Notes

In `message-row.tsx`, for assistant messages, add a hover-revealed copy button:

```tsx
<button
  onClick={() => navigator.clipboard.writeText(content)}
  className="opacity-0 group-hover:opacity-100 absolute top-2 right-2"
  aria-label="Copy message"
>
  {copied ? "✓" : "Copy"}
</button>
```

Wrap the message in a `relative group` container to enable the hover reveal.

## Resolution

Added a `CopyMessageButton` component that appears on hover over assistant messages (using `group-hover/msg:opacity-100`). The button copies raw markdown content to clipboard, shows a checkmark for 2 seconds, and only renders on messages with status "complete". Added `relative` and `group/msg` classes to the assistant message container. Deployed to Cloudflare Workers.
