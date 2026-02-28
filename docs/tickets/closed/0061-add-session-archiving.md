# Add Session Archiving

**Type:** feature
**Severity:** low
**Component:** web, server
**Reported:** 2026-02-27

## Description

As the number of conversations grows, the sidebar becomes cluttered. There's no way to archive old conversations to clean up the list without permanently deleting them (once ticket 0011 is implemented).

## Expected Behavior

1. Add an "Archive" option for sessions (context menu or swipe action)
2. Archived sessions are hidden from the main sidebar list
3. An "Archived" section or filter in the command palette lets users access archived sessions
4. Archived sessions can be unarchived

## Implementation Notes

### Schema
Add `is_archived: bool` (default false) to the `Session` table. Add an `archive_session` reducer.

### Frontend
1. Filter sessions in sidebar: only show where `is_archived === false`
2. Add "Archive" to session context menu or command palette
3. Add "Show archived" toggle or command palette command
4. In the archived view, show an "Unarchive" option

### Alternative
Instead of a boolean, use a `status` value like "archived" and filter it from the default view. But this conflicts with the existing status field which tracks session processing state. Separate boolean is cleaner.

## Resolution

Added `is_archived: bool` (default false) to Session table and `archive_session` reducer that takes a bool to set/unset. Sidebar filters out archived sessions by default. When archived sessions exist, an "X archived" button appears next to the filter input that toggles showing all sessions. Clicking it switches to "all" mode. Context menu has "Archive"/"Unarchive" toggle. Archived sessions show a small "archived" label below their title when visible.
