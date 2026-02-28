# Missing ARIA Labels on Interactive Elements

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

Multiple interactive elements across the frontend are missing ARIA labels, making the app inaccessible to screen reader users. Key offenders:

1. **sidebar.tsx:65**: Command palette button shows "⌘K" text but no `aria-label="Open command palette"`
2. **sidebar.tsx:72**: Theme toggle shows a sun/moon symbol but no `aria-label="Toggle dark mode"`
3. **sidebar.tsx:79**: New chat button has text "+ New" but no descriptive label
4. **sidebar.tsx:127**: Session selection buttons have no label describing the session
5. **input-bar.tsx:61**: Send button is an icon-only button with no `aria-label="Send message"`
6. **input-bar.tsx:46**: Textarea has placeholder text but no associated `<label>` element
7. **markdown-content.tsx:16**: Copy code button has no `aria-label="Copy code"`
8. **message-row.tsx:70**: Tool call expand/collapse buttons show chevron only, no label
9. **command-palette.tsx:106**: Search input has placeholder but no label

Additionally, the textarea in `input-bar.tsx` has `focus:outline-none` which removes the focus indicator entirely, violating WCAG 2.4.7.

## Expected Behavior

Add appropriate ARIA labels to all interactive elements. For icon-only buttons, add `aria-label`. For form inputs, add either a `<label>` element or `aria-label`.

Remove `focus:outline-none` from the textarea, or replace it with a visible custom focus style using `focus-visible:ring-2`.

## Implementation Notes

This is a straightforward pass through all components. Each button needs an `aria-label` prop, each input needs a label. Example fixes:

```tsx
<button aria-label="Open command palette" ...>⌘K</button>
<button aria-label="Toggle theme" ...>☀</button>
<button aria-label="Send message" disabled={!input.trim()} ...>
<textarea aria-label="Message input" className="... focus-visible:ring-2 ring-accent" ...>
```

## Resolution

Added `aria-label` to all icon-only buttons: command palette ("Open command palette"), theme toggle ("Toggle theme"), session buttons ("Open conversation: {title}"), send button ("Send message"), copy code button ("Copy code"), copy message button (already had it), command palette search input ("Search conversations and actions"), textarea ("Message input"). Added `focus-visible:ring-2` on textarea to replace removed focus outline.
