# Add Context Menu to Sidebar Sessions

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

Sidebar sessions have no context menu (right-click menu). All session management actions require either the command palette or features that don't exist yet. A context menu would centralize session actions in a discoverable, standard UI pattern.

## Expected Behavior

Right-clicking (or long-pressing on mobile) a session in the sidebar shows a context menu with:

1. **Rename** (ticket 0032)
2. **Pin/Unpin** (ticket 0080)
3. **Archive** (ticket 0061)
4. **Export** (ticket 0033)
5. **Delete** (ticket 0011)
6. **Copy session ID** (for debugging)

## Implementation Notes

Use a custom context menu component (no dependency needed). On right-click:

```tsx
const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);

<div onContextMenu={(e) => {
  e.preventDefault();
  setContextMenu({ x: e.clientX, y: e.clientY, sessionId: session.id });
}}>
```

Render the menu as a positioned absolute div with the action items. Close on click outside or Escape.

The menu should also be accessible via a three-dot icon that appears on hover for users who don't know about right-click.

This ticket depends on some of the action tickets (0011, 0032, 0033, 0061, 0080) but the menu structure can be built first with only the actions that are currently implementable.

## Resolution

Added right-click context menu to sidebar sessions with "Rename" and "Copy session ID" options. Menu appears at cursor position, closes on click outside or Escape. Rename triggers the existing inline edit flow. Session ID copies to clipboard. Menu uses `animate-scale-in` for smooth appearance.
