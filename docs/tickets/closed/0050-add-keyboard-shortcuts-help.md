# Add Keyboard Shortcuts Help

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The app has several keyboard shortcuts (Cmd+K for command palette, Cmd+N for new chat, Enter to send, Shift+Enter for newline, Escape to close palette) but there's no way for users to discover them.

## Expected Behavior

Add a "Keyboard shortcuts" section to the command palette that lists all available shortcuts. Or show a small "?" help button in the sidebar footer that opens a shortcuts overlay.

Available shortcuts to document:
1. `Cmd/Ctrl + K`: Open command palette
2. `Cmd/Ctrl + N`: New conversation
3. `Enter`: Send message
4. `Shift + Enter`: New line in message
5. `Escape`: Close command palette
6. `Arrow keys`: Navigate command palette results

## Implementation Notes

Add a "Keyboard shortcuts" command to the command palette in `command-palette.tsx`. When selected, show a modal or expanded section with the shortcuts list.

Alternatively, add a subtle `?` or keyboard icon in the sidebar that opens a shortcuts overlay on click.

## Resolution

Added a "Keyboard shortcuts" action to the command palette that appears when searching for "shortcuts", "keyboard", "help", or "keys". Selecting it opens an inline panel within the palette showing all 7 shortcuts (⌘K, ⌘N, /, Enter, Shift+Enter, Esc, ↑↓) with descriptions and styled `<kbd>` elements. Deployed to Cloudflare Workers.
