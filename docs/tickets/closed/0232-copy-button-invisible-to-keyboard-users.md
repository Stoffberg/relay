# Code Block Copy Button Invisible to Keyboard Users

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

In `markdown-content.tsx`, the copy button on code blocks uses `opacity-0 group-hover:opacity-100` for show/hide behavior. This means the button is invisible to keyboard-only users since focus doesn't trigger `group-hover`. The button is technically focusable via Tab, but the user can't see it and has no visual indication it exists.

## Expected Behavior

The copy button should also become visible when the code block or the button itself receives keyboard focus.

## Implementation Notes

Add `group-focus-within:opacity-100` and `focus:opacity-100` to the copy button's class list:

```tsx
className="... opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
```

## Resolution

Added `group-focus-within:opacity-100` and `focus:opacity-100` to the copy button's className in `markdown-content.tsx`. Keyboard users now see the button when tabbing into the code block or when the button itself receives focus. Deployed to Cloudflare Workers.
