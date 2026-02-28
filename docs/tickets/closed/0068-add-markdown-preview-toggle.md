# User Messages Render as Plain Text, Not Markdown

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

In `message-row.tsx`, user messages are rendered with `whitespace-pre-wrap` as plain text, while assistant messages get full markdown rendering (code blocks, tables, links, lists). This means when a user sends a message containing markdown (like a code snippet or a numbered list), it appears as raw markdown syntax instead of being rendered.

## Expected Behavior

Two options:

1. **Render user messages as markdown too**: Apply the same `MarkdownContent` component to user messages. This makes code snippets, links, and formatting work in both directions.

2. **Keep user messages as plain text**: If the design intent is to distinguish user from assistant visually, keep plain text but at least linkify URLs in user messages.

Option 1 is better UX since users often paste code snippets or formatted text.

## Implementation Notes

In `message-row.tsx`, replace the plain text rendering for user messages:

```tsx
// Instead of:
<span className="whitespace-pre-wrap">{content}</span>

// Use:
<MarkdownContent content={content} />
```

Or if keeping it plain, at least auto-link URLs:
```tsx
<span className="whitespace-pre-wrap">{linkifyText(content)}</span>
```

## Resolution

User messages now render through `MarkdownContent` instead of plain text, so code snippets, links, lists, and other formatting work in both directions. The user message container still uses the dot indicator and pending/queued styling. Deployed to Cloudflare Workers.
