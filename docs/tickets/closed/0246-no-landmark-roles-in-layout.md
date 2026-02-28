# Layout Has No Semantic Landmark Elements

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The root layout in `__root.tsx` uses plain `<div>` elements for the entire page structure. There are no semantic HTML5 landmarks: no `<main>`, `<nav>`, `<aside>`, or `<header>` elements. There's also no skip-to-content link.

Screen reader users rely on landmarks to navigate page regions. Without them, the entire page is an undifferentiated blob of content.

Note: ticket 0057 (open) covers missing ARIA labels on interactive elements. This is about the structural landmark elements, which is a separate concern.

## Expected Behavior

The layout should use semantic elements:
- Sidebar: `<aside>` or `<nav aria-label="Sessions">`
- Chat area: `<main>`
- Input bar: within `<main>`, optionally wrapped in `<footer>`
- A skip-to-content link as the first focusable element

## Implementation Notes

Replace the outer `<div>` wrappers with semantic elements. The sidebar should be `<nav aria-label="Chat sessions">`, the main content area should be `<main>`, and add a visually hidden skip link:

```tsx
<a href="#main-content" className="sr-only focus:not-sr-only">Skip to content</a>
```

## Resolution

Changed the sidebar wrapper from `<div>` to `<nav aria-label="Chat sessions">` in `sidebar.tsx`. Changed the main content area from `<div>` to `<main id="main-content">` in `__root.tsx`. Added a visually hidden skip link (`sr-only focus:not-sr-only`) as the first focusable element. Deployed to Cloudflare Workers.
