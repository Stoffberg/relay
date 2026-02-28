# Tool Call Pill Button Wraps Block-Level Elements (Invalid HTML)

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

In `message-row.tsx`, each tool call is rendered as a `<button>` element that wraps `<div>` and `<pre>` elements when expanded. Nesting block-level elements inside `<button>` is invalid HTML per the spec. Screen readers may not properly announce the content, and browser rendering behavior is inconsistent.

The expanded state shows a `<div>` containing the header, and another `<div>` with a `<pre>` for the tool output, all inside the `<button>`.

## Expected Behavior

Separate the clickable header from the expandable content. Use a `<button>` only for the toggle trigger, and render the expanded output as a sibling element outside the button.

## Implementation Notes

```tsx
<div key={tc.id} className="w-full">
  <button type="button" onClick={toggle} aria-expanded={isExpanded}>
    <span className="flex items-center gap-2">...</span>
  </button>
  {isExpanded && (
    <div className="mt-1 rounded-[6px]">
      <pre>...</pre>
    </div>
  )}
</div>
```

This also addresses ticket 0165 (aria-expanded) since the button now properly wraps only inline content.

## Resolution

Refactored the tool call pill in `message-row.tsx` so the `<button>` only wraps the toggle header (inline content). The expanded output `<div>` with `<pre>` is now a sibling element outside the button, making the HTML valid. Added `aria-expanded` to the button for accessibility. Deployed to Cloudflare Workers.
