# Add Print/Export CSS Styles

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

There are no `@media print` styles. If a user tries to print a conversation or save it as PDF via the browser, they get the sidebar, input bar, and broken layout. Printing is a quick way to share or archive conversations without implementing full export (ticket 0033).

## Expected Behavior

Add print styles that:
1. Hide the sidebar, input bar, and connection status
2. Show messages in a clean, readable format
3. Expand all collapsed tool calls
4. Use black text on white background regardless of theme
5. Show the session title as a page header

## Resolution

Added `@media print` block to styles.css. Hides sidebar, input bar, skip link, and scroll-to-bottom button. Forces white background and black text. Expands collapsed tool calls. Makes main content area overflow visible for continuous print flow.

