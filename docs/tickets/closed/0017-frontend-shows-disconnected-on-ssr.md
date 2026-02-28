# Frontend Shows "disconnected" on Initial SSR Load

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-26

## Description

When loading `code.stoff.dev`, the server side rendered HTML shows a "disconnected" status indicator with a gray dot and "disconnected" label. Since SpacetimeDB connections are client side only (WebSocket), the SSR render will always show the disconnected state.

This means:
1. First paint shows "disconnected" for a brief flash before the client hydrates and connects
2. Search engines and social media scrapers see "disconnected" text
3. Users on slow connections see a potentially alarming "disconnected" message before JS loads

## Steps to Reproduce

1. Fetch `https://code.stoff.dev` and inspect the raw HTML
2. The connection indicator in the sidebar shows `disconnected` in the SSR response
3. After JS hydration, it switches to "connecting" then "connected"

## Expected Behavior

The SSR render should either:
1. Hide the connection indicator entirely during SSR (show it only after hydration)
2. Show a neutral "initializing..." state instead of "disconnected"
3. Use a CSS animation that shows a subtle loading state that transitions smoothly to "connected"

## Implementation Notes

In `apps/web/src/components/sidebar.tsx`, the ConnectionIndicator component renders based on `connState`. During SSR, this will be the default state ("disconnected"). 

Options:
1. Wrap the connection indicator in a client only component that only renders after mount
2. Change the default state from "disconnected" to something neutral like "initializing"
3. Use `useEffect` to only show the indicator after hydration, with a CSS transition

## Resolution

Changed ConnectionIndicator to render 'connecting' as the default SSR state instead of hiding or showing 'disconnected'. Uses a hydrated flag to switch to the real state after mount. SSR now renders a proper yellow pulsing dot with 'connecting' text, which is what the user would see anyway since the WebSocket starts immediately on hydration.
