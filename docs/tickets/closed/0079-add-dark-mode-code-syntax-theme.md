# Code Syntax Highlighting Doesn't Match Theme

**Type:** bug
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The markdown renderer uses `rehype-highlight` for syntax highlighting, which applies highlight.js CSS classes. But there's no explicit highlight.js theme imported that matches the app's dark/light mode.

This means either:
1. No syntax highlighting colors are applied (just plain monospace text)
2. The default theme is used which may clash with the app's color scheme
3. The theme doesn't switch between dark and light mode

## Expected Behavior

Import a highlight.js theme that matches the app's design system:
1. In dark mode: a dark syntax theme (e.g., `github-dark`, `one-dark-pro`)
2. In light mode: a light syntax theme (e.g., `github`, `one-light`)
3. The theme switches automatically when the user toggles dark/light mode

## Implementation Notes

In `apps/web/src/styles.css` or in the markdown component:

```css
@import 'highlight.js/styles/github-dark.css' (prefers-color-scheme: dark);
@import 'highlight.js/styles/github.css' (prefers-color-scheme: light);
```

Or since the app uses a class based theme toggle (`.dark`/`.light` on root):

```css
:root.dark {
  @import 'highlight.js/styles/github-dark.css';
}
:root.light {
  @import 'highlight.js/styles/github.css';
}
```

Check if highlight.js is already a dependency (it comes with rehype-highlight) and import the CSS directly.

## Resolution

Added `:root.light .hljs*` CSS overrides in styles.css that apply GitHub light theme colors when light mode is active. Covers keywords, strings, numbers, comments, functions, built-ins, and tags. Dark mode continues using the imported `github-dark-dimmed.css`.
