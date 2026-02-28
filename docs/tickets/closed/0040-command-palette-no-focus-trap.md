# Command Palette Has No Focus Trap

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

In `apps/web/src/components/command-palette.tsx`, when the modal is open, pressing Tab moves focus outside the palette to elements behind the overlay. There's no focus trap to keep keyboard focus within the palette.

This is both an accessibility violation (WCAG 2.4.3 Focus Order) and a UX issue. Users navigating with keyboard can "escape" the modal unintentionally and interact with elements they can't see behind the overlay.

## Expected Behavior

When the command palette is open:
1. Tab should cycle focus within the palette (input → results → input)
2. Focus should not escape to elements behind the overlay
3. When the palette closes, focus should return to the element that opened it

## Implementation Notes

Options:
1. Use `@radix-ui/react-focus-scope` (if Radix is already a dependency)
2. Use a custom focus trap: track the first and last focusable elements, intercept Tab/Shift+Tab at boundaries
3. Use the `inert` attribute on the content behind the overlay to prevent it from receiving focus

Simplest approach for this codebase (no Radix dependency detected):

```tsx
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Tab") {
    e.preventDefault(); // Trap focus in palette
  }
  // ... existing arrow/enter/escape handling
};
```

Since the palette only has one input and results are navigated with arrow keys (not Tab), trapping Tab is the cleanest solution. Users already use arrows for navigation.

## Resolution

Added Tab key trap in the command palette's `onKey` handler. `e.preventDefault()` on Tab before any other key handling, so focus never escapes the modal. Users navigate with arrow keys, Enter, and Escape as before.
