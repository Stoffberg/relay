# Session Error Status Not Visible in Sidebar

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-26

## Description

In `apps/web/src/components/sidebar.tsx`, when a session enters "error" status, the sidebar shows no visual difference from an idle session. The `isBusy` check only looks for `streaming` and `waiting_for_tool` statuses, so errored sessions look normal.

Users have no way to know a session failed without clicking into it and reading the messages.

## Expected Behavior

Sessions with status "error" should show a visual indicator in the sidebar:
1. A red dot or icon next to the session title
2. Different text color or background color for the session row
3. The session status text ("Error") shown below the title in red

## Implementation Notes

In `sidebar.tsx`, add a check alongside `isBusy`:

```tsx
const isError = session.status === "error";
```

Then apply a conditional class to the session row:
```tsx
<div className={cn("...", isError && "border-l-2 border-red-500")}>
```

Or show a small red indicator dot similar to the connection status dot.

## Resolution

Added isError check alongside isBusy in the sidebar session list. Error sessions now show a red dot, red 'error' label, and a red left border. Visual treatment is distinct from both idle and busy states.
