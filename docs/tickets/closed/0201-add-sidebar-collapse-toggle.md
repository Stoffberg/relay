# Add Sidebar Collapse/Toggle

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The sidebar is fixed at 380px wide and always visible. On smaller laptop screens (1280px or less), it eats ~30% of the viewport. There's no way to collapse, hide, or resize it. Users who want more space for the chat content have no option.

This is distinct from ticket 0038 (mobile responsive layout), which covers phone/tablet breakpoints. This is about desktop users wanting to maximize chat space.

## Expected Behavior

Add a sidebar toggle button (hamburger icon or collapse arrow) that:
1. Collapses the sidebar to a narrow strip (icons only, ~48px) or hides it completely
2. Preserves the collapse state in localStorage
3. Has a keyboard shortcut (e.g., Cmd+Shift+S or Cmd+\\)
4. Optionally: add a drag handle for manual resize

## Resolution

Added sidebar collapse toggle with `⌘\` keyboard shortcut. State persisted in localStorage. When collapsed with a chat open, sidebar shrinks to 48px showing only expand and new-chat icon buttons. Full sidebar shows a collapse chevron button in the header (only visible when a chat is open). Expand button restores full sidebar.

