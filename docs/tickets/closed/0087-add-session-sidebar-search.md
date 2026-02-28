# Add Dedicated Search Bar in Sidebar

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The command palette (Cmd+K) can search sessions, but there's no dedicated search bar in the sidebar itself. Users who don't know about the command palette have no way to filter sessions. As the number of sessions grows, scrolling through all of them becomes tedious.

## Expected Behavior

Add a search/filter input at the top of the sidebar session list:
1. Small text input that filters sessions by title as you type
2. Appears below the sidebar header, above the session list
3. Clears with an X button or Escape key
4. Shows match count while filtering
5. Optional: search message content too (not just titles)

## Implementation Notes

In `sidebar.tsx`, add a filter input above the session list:

```tsx
const [filter, setFilter] = useState("");
const filteredSessions = sessions.filter(s =>
  !filter || s.title.toLowerCase().includes(filter.toLowerCase())
);
```

Render the input in the sidebar header area:

```tsx
<input
  type="text"
  placeholder="Filter conversations..."
  value={filter}
  onChange={(e) => setFilter(e.target.value)}
  className="w-full px-3 py-1.5 text-sm bg-surface rounded-md"
/>
```

Keep it hidden by default and show it via a search icon click or keyboard shortcut (Cmd+Shift+F or just `/`).

## Resolution

Added filter input at the top of the sidebar session list. Filters sessions by title (case insensitive substring match). Shows filtered/total count. Uses `useMemo` for efficient filtering. Session numbering adjusts to filtered list length.
