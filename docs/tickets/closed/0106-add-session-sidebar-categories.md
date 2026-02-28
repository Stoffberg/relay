# Add Time-Based Categories to Sidebar

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The sidebar shows all sessions in a flat list sorted by most recently updated. As the number of sessions grows, this becomes a long undifferentiated scroll. Most chat apps (ChatGPT, Claude.ai) group conversations by time period.

## Expected Behavior

Group sessions in the sidebar by time categories:
1. **Today**: Sessions updated today
2. **Yesterday**: Sessions updated yesterday
3. **Previous 7 days**: Sessions from the last week
4. **Previous 30 days**: Sessions from the last month
5. **Older**: Everything else

Each group has a subtle header. Empty groups are hidden.

## Implementation Notes

In `sidebar.tsx`, after sorting sessions by updatedAt, group them by time category:

```tsx
const categories = [
  { label: "Today", test: (d: Date) => isToday(d) },
  { label: "Yesterday", test: (d: Date) => isYesterday(d) },
  { label: "Previous 7 days", test: (d: Date) => isWithinDays(d, 7) },
  { label: "Previous 30 days", test: (d: Date) => isWithinDays(d, 30) },
  { label: "Older", test: () => true },
];
```

Render category headers as non-interactive dividers between session groups. Use the existing `extractTimestamp` helper to convert SpacetimeDB timestamps.

## Resolution

Duplicate of ticket 0209. Date grouping (Today, Yesterday, This week, This month, Older) was implemented in the sidebar as part of that ticket. Category headers are rendered as non-interactive dividers, empty groups are hidden.
