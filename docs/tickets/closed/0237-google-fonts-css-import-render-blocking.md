# Google Fonts Loaded via Render-Blocking CSS @import

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

In `styles.css`, Google Fonts is loaded via `@import url('https://fonts.googleapis.com/...')` on line 1. CSS `@import` is render-blocking: the browser must download and parse the imported stylesheet before it can render the page. This adds a network round-trip to an external domain in the critical rendering path.

While there are `<link rel="preconnect">` hints in `__root.tsx`, the actual stylesheet fetch is still render-blocking because it's a CSS import rather than an HTML `<link>` element.

## Expected Behavior

Load Google Fonts via a `<link>` element in the HTML `<head>` (which can be marked with `media="print" onload="this.media='all'"` for non-blocking), or self-host the font files.

## Implementation Notes

Option 1 (quick): Move the `@import` to a `<link>` in the root route's `<head>`:
```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=..." />
```

Option 2 (better): Use `font-display: swap` via the Google Fonts URL parameter `&display=swap` and move to a `<link>` tag.

Option 3 (best): Self-host the font files to eliminate the external dependency entirely.

## Resolution

Moved the Google Fonts `@import` from `styles.css` line 1 to a `<link rel="stylesheet">` in the root route's head config. The browser can now discover and fetch the font CSS in parallel with the main stylesheet instead of blocking on a sequential CSS import chain. The `&display=swap` parameter was already present. Deployed to Cloudflare Workers.
