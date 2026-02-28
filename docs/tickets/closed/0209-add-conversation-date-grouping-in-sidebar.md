# Add Date-Based Grouping to Sidebar Sessions

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

Sessions are displayed as a flat list sorted by `updatedAt`. As the number of sessions grows, the list becomes hard to scan. ChatGPT groups conversations as "Today", "Yesterday", "Previous 7 Days", "Last 30 Days", "Older", which makes navigation much faster.

This is distinct from ticket 0106 (user-defined sidebar categories). Date-based grouping is automatic and requires no user action.

## Expected Behavior

Group sessions by time period:
- **Today:** sessions updated today
- **Yesterday:** sessions updated yesterday
- **This week:** earlier this week
- **This month:** earlier this month
- **Older:** everything else

Show group headers between sections. Each header should be a subtle divider with the group name.

## Implementation Notes

The `updatedAt` timestamp is already available. This is purely a frontend rendering change: bucket the sorted sessions array into groups based on date comparison, then render with section headers.

## Resolution

Added date-based grouping headers in the sidebar: "Today", "Yesterday", "This week", "This month", "Older". Computed via `getDateGroup()` helper comparing against current date boundaries. Group headers render as subtle uppercase labels above the first session in each group. Uses `useMemo` for efficient recomputation.

