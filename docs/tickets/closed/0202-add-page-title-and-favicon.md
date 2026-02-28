# Add Dynamic Page Title and Favicon

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The browser tab always shows "Relay" regardless of which session is active or what's happening. There's no favicon defined. Modern chat apps update the tab title with the conversation name and show activity indicators in the favicon.

## Expected Behavior

1. Set page title to session name: `"Session Title | Relay"` or just `"Relay"` when on the landing page
2. Add a favicon (`/favicon.svg` or `/favicon.ico`)
3. Optionally: show a streaming indicator in the title (e.g., `"● Relay"` or `"[typing...] Relay"`) when a response is being generated, so users in another tab know when the response is ready

## Resolution

Added an inline SVG favicon (⚡ emoji) via the root route's `head.links`. Added a `useEffect` in the chat route that sets `document.title` to `"Session Title | Relay"` based on the SpacetimeDB cache, updating when the session changes or messages arrive. Resets to "Relay" on unmount. Deployed to Cloudflare Workers.

