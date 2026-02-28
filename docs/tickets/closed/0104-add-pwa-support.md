# Add Progressive Web App (PWA) Support

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The app runs well in a browser but doesn't support installation as a PWA. Adding PWA support would let users:
1. Install the app on their desktop/mobile home screen
2. Get a dedicated window without browser chrome
3. Optionally receive push notifications (future)
4. Work offline for viewing previous conversations (future)

## Expected Behavior

1. Add a `manifest.json` with app name, icons, theme colors
2. Register a service worker for asset caching
3. Add install prompt (or rely on browser's native install button)
4. App opens in standalone mode without address bar

## Implementation Notes

1. Create `public/manifest.json`:
```json
{
  "name": "Relay",
  "short_name": "Relay",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#5ba5f5",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

2. Add to `__root.tsx`:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0a0a0a" />
```

3. Generate app icons (192px and 512px versions of the Relay logo)

Service worker for offline support can come later. The manifest alone enables installation.

## Resolution

Created `apps/web/public/manifest.json` with app name, standalone display mode, dark theme colors, and SVG icon. Added manifest link, theme-color meta, and apple-mobile-web-app-capable meta to the root route head. App is now installable from browser without a service worker.
