# Add Session Pinning in Sidebar

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

Sessions are sorted by most recently updated, which means actively used sessions stay at the top. But sometimes a user wants to keep a specific session easily accessible regardless of when it was last updated.

## Expected Behavior

1. Add a "Pin" option to sessions (via right-click context menu, long press, or a pin icon on hover)
2. Pinned sessions appear in a "Pinned" section at the top of the sidebar
3. Pinned sessions stay at the top regardless of update time
4. Unpinning moves them back to the regular sorted list

## Implementation Notes

### Schema
Add `is_pinned: bool` (default false) to the `Session` table. Add a `toggle_session_pin` reducer.

### Frontend
In `sidebar.tsx`:
1. Separate sessions into pinned and unpinned groups
2. Render pinned sessions first with a subtle "Pinned" header
3. Add a pin icon on hover for each session
4. On click, call the `toggle_session_pin` reducer

### Alternative (no schema change)
Store pinned session IDs in localStorage on the client. Simpler, but pinning doesn't sync across devices/browsers.

## Resolution

Added client-side session pinning via localStorage. Pinned sessions sort to the top of the sidebar. Right-click context menu shows "Pin"/"Unpin" toggle. Pinned sessions show a "•" indicator instead of row number. State persisted in `localStorage("relay-pinned")` as a JSON array of session IDs. No schema changes needed.
