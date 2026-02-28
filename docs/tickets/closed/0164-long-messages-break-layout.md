# Extremely Long Messages Can Break Chat Layout

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

User messages in `message-row.tsx` are rendered in a `<p>` tag with `whitespace-pre-wrap` but no word-break, text truncation, or max-height constraint. A message containing a single unbroken string (e.g., a long URL, base64 blob, or pasted binary data) will overflow its container horizontally, breaking the chat layout.

In `apps/web/src/components/message-row.tsx` around line 25:

The user message content is rendered as-is with only whitespace handling. No `overflow-wrap: break-word` or `word-break: break-all` to handle long unbroken strings.

## Expected Behavior

Add `break-words` (Tailwind) or `overflow-wrap: break-word` to the message content element so long strings wrap within the container instead of overflowing.

## Resolution

Added `break-words` (Tailwind's `overflow-wrap: break-word`) to the user message `<p>` element in `message-row.tsx`. Long unbroken strings now wrap within the container instead of overflowing horizontally.

