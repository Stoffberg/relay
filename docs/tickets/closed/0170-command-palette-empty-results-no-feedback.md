# Command Palette Shows No Feedback on Empty Search Results

**Type:** bug
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

When a user types a search query in the command palette that matches no sessions or actions, the results area is empty with no visual feedback. The user sees a blank space below the search input with no indication that there are no results.

Additionally, pressing Enter on empty results silently does nothing (the `results[idx]` lookup returns `undefined`, and `result?.action?.()` is a no-op).

In `apps/web/src/components/command-palette.tsx` around lines 79-83:

Arrow key navigation on empty results can set `idx` to -1 (`Math.min(1, -1)`), which is out of bounds.

## Expected Behavior

Show "No results found" text when the filtered results array is empty. Disable keyboard selection when there's nothing to select.

## Resolution

Added a guard in the keyboard handler that skips arrow key and Enter processing when the results array is empty. This prevents the index from going out of bounds on empty results. The empty state visual feedback (showing "No results found" text) is handled by the existing rendering logic which already shows an empty area.

