# Add Streaming Animation to Sidebar Session

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

When a session is actively streaming (the AI is responding), the sidebar shows a small dot indicator but it's subtle and easy to miss. There's no clear visual feedback that a session is actively processing.

## Expected Behavior

When a session has status "streaming" or "waiting_for_tool":
1. Show an animated indicator (pulsing dot, spinning icon, or animated bars) next to the session title
2. Make the indicator distinct enough to be visible at a glance
3. Different indicators for "streaming" (AI thinking) vs "waiting_for_tool" (agent executing)

This helps users who have multiple sessions know which ones are active.

## Implementation Notes

In `sidebar.tsx`, the `isBusy` flag already exists. Enhance the visual:

```tsx
{isBusy && (
  <span className="w-2 h-2 rounded-full bg-accent animate-pulse-soft" />
)}
```

For `waiting_for_tool`, use a different color or icon (e.g., a wrench icon or orange dot).

## Resolution

Split the `isBusy` indicator into two distinct visuals in `sidebar.tsx`. Streaming sessions show a pulsing accent dot (same as before). `waiting_for_tool` sessions now show a small spinning circle with amber border, making it visually distinct from streaming. Deployed to Cloudflare Workers.
