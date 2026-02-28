# Command Palette Missing ARIA Dialog Semantics

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The command palette overlay in `command-palette.tsx` is a plain `<div>` with no `role="dialog"`, `aria-modal="true"`, or `aria-label`. Screen readers won't announce this as a modal dialog, and users won't know they've entered a modal context.

The search results also lack `role="listbox"` and `aria-selected` on the highlighted item, so keyboard navigation between results isn't announced.

Note: ticket 0040 (open) covers focus trap. This is about the ARIA semantics which are a separate concern.

## Expected Behavior

The command palette should have proper ARIA semantics:
- Outer container: `role="dialog"`, `aria-modal="true"`, `aria-label="Command palette"`
- Results list: `role="listbox"`
- Each result: `role="option"`, `aria-selected={isHighlighted}`
- Input: `aria-controls="results-list-id"`, `aria-activedescendant="highlighted-option-id"`

## Implementation Notes

Standard combobox/listbox pattern from WAI-ARIA. The `@headlessui/react` Combobox component implements this pattern if a library approach is preferred.

## Resolution

Added `role="dialog"`, `aria-modal="true"`, `aria-label="Command palette"` to the overlay container. The input has `role="combobox"`, `aria-controls`, and `aria-activedescendant`. Results list uses `role="listbox"` and each result has `role="option"` with `aria-selected`. Deployed to Cloudflare Workers.
