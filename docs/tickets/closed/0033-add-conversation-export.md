# Add Conversation Export

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-26

## Description

There's no way to export a conversation. Users may want to save chat history as markdown, share it with someone, or archive it before deleting.

## Expected Behavior

Add an export option accessible from:
1. The command palette (Cmd+K, then "Export conversation")
2. A context menu or button in the chat header

Export formats:
1. **Markdown** (default): Each message as a heading with role, content as markdown body, tool calls as code blocks
2. **JSON** (optional): Raw message data for programmatic use

The export should download as a file named `relay-{session-title}-{date}.md`.

## Implementation Notes

In the frontend, build the markdown string from the chat store's messages:

```markdown
# Relay: {session title}
Exported: {date}

## User
{message content}

## Assistant
{message content}

### Tool: shell_exec
**Args:** `ls -la`
**Output:**
```
{tool output}
```
```

Use `URL.createObjectURL()` + `<a download>` pattern to trigger the download without a server roundtrip.

Add the command to `command-palette.tsx` and optionally a download icon button in the chat header area.

## Resolution

Added "↓ Export" button in the chat header area that exports the current conversation as a markdown file. Builds markdown with session title, export date, and all messages with role headings, content, and tool call details. Downloads via `URL.createObjectURL()` + `<a download>`. Added `onExport` prop to CommandPalette interface for future integration. Filename format: `relay-{slug}-{date}.md`.
