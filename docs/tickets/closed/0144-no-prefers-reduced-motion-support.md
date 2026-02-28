# No prefers-reduced-motion Support for Animations

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The stylesheet in `styles.css` defines 13 CSS animations (fade-in, slide-up, pulse, expand, shimmer, etc.) but does not respect the `prefers-reduced-motion` media query. Users who have enabled "Reduce Motion" in their operating system settings (common for people with vestibular disorders) will still see all animations.

This violates WCAG 2.3.3 (Animation from Interactions) which recommends that motion animation triggered by interaction can be disabled.

## Expected Behavior

Add a media query at the end of `styles.css` that disables or reduces all animations:

```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}
```

Or more granularly, override each `.animate-*` class to use `animation: none`.

## Implementation Notes

The `@keyframes expand` animation (line 254-263 in styles.css) animates `max-height` which can also cause layout jank on slower devices. Under reduced motion, this should definitely be disabled.

## Resolution

Added a `@media (prefers-reduced-motion: reduce)` block at the end of `styles.css` that sets `animation-duration: 0.01ms !important`, `animation-iteration-count: 1 !important`, and `transition-duration: 0.01ms !important` on all elements. This effectively disables all animations for users with reduced motion preferences while keeping the layout intact.

