# Add Session Metadata Display in Chat Header

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The chat area has no header showing information about the current session. Users don't see:
1. The session title
2. The model being used
3. The session creation date
4. Message count
5. Session status

This information would help users orient themselves, especially when they have many conversations open.

## Expected Behavior

Add a minimal header bar at the top of the chat area showing:
1. Session title (editable, links to ticket 0032)
2. Model name (if per-session model is implemented, ticket 0023)
3. Subtle metadata: message count, created date

Keep it minimal. A single row with the title and a few status indicators. Clicking the title enters edit mode.

## Implementation Notes

In `chat.$sessionId.tsx`, add a header above the virtualizer:

```tsx
<div className="flex items-center justify-between px-6 py-3 border-b border-border">
  <h2 className="text-sm font-medium truncate">{session?.title || "New conversation"}</h2>
  <span className="text-xs text-muted">{messageCount} messages</span>
</div>
```

Get the session data from the SpacetimeDB subscription cache.

## Resolution

Added a minimal session header bar between the error banner and the chat scroll area. Shows session title (from SpacetimeDB cache, falling back to "New conversation") and message count. Uses responsive padding (`px-3 md:px-6`) and subtle bottom border styling.
