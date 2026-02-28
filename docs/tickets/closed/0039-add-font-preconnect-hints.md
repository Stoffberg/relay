# Add Font Preconnect and Preload Hints

**Type:** task
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The frontend loads Google Fonts (Figtree and JetBrains Mono) via `@import` in `styles.css`. This means the browser has to:
1. Download the HTML
2. Download and parse the CSS
3. Discover the @import directive
4. Connect to fonts.googleapis.com
5. Download the font CSS
6. Connect to fonts.gstatic.com
7. Download the font files

Steps 4 and 6 each require a new TCP + TLS handshake. Adding preconnect hints in the HTML head can eliminate this latency.

## Expected Behavior

Add these tags to the HTML head in `__root.tsx`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
```

This lets the browser start the connection to Google Fonts as soon as it parses the HTML, saving 100 to 200ms on font loading.

## Implementation Notes

In `apps/web/src/routes/__root.tsx`, in the `<head>` section, add the preconnect links before any stylesheet references. The `crossOrigin` attribute on the gstatic link is required because font files are fetched with CORS.

## Resolution

Added preconnect link tags for fonts.googleapis.com and fonts.gstatic.com (with crossOrigin) to the head links array in __root.tsx. These load before the stylesheet, saving 100 to 200ms on font loading. Web deployed.
