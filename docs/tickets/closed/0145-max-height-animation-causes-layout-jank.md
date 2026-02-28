# max-height Animation Causes Layout Jank

**Type:** bug
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The `@keyframes expand` animation in `styles.css` animates `max-height` from 0 to a target value. Unlike `transform` and `opacity` (which are GPU-composited), `max-height` triggers layout recalculation on every frame, causing jank on lower-end devices or when expanding large content areas.

In `apps/web/src/styles.css` around lines 254-263:

```css
@keyframes expand {
    from { max-height: 0; overflow: hidden; }
    to { max-height: var(--expand-to, 500px); overflow: hidden; }
}
```

All other animations in the file correctly use `transform` and `opacity` for smooth GPU compositing.

## Expected Behavior

Replace `max-height` animation with a `transform: scaleY()` approach or use `grid-template-rows: 0fr` to `1fr` transition (modern CSS, well-supported). Alternatively, use the Web Animations API with `will-change: max-height` to hint the browser.

## Implementation Notes

The modern approach:

```css
.expandable {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.3s ease;
}
.expandable.expanded {
    grid-template-rows: 1fr;
}
.expandable > div {
    overflow: hidden;
}
```

This avoids layout thrashing entirely and is supported in all modern browsers.

## Resolution

Replaced the `@keyframes expand` + `max-height` animation with a CSS grid-based expand pattern using `grid-template-rows: 0fr` to `1fr` transition. This avoids layout thrashing entirely since grid row changes are handled more efficiently by the rendering engine. The old `.animate-expand` class was unused in components, so this is a clean swap to `.expandable` / `.expandable.expanded`.

