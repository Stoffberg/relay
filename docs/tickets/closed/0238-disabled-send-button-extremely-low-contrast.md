# Disabled Send Button Has Extremely Low Contrast (15% Opacity)

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

In `input-bar.tsx`, the send button uses `disabled:opacity-15` which renders the button at 15% opacity when disabled. This is barely visible, especially in light mode, and fails WCAG contrast requirements. Users may not realize the button exists or that it's in a disabled state.

## Expected Behavior

Disabled state should be clearly visible while still looking inactive. WCAG requires a contrast ratio of at least 3:1 for UI components. Use `disabled:opacity-40` or `disabled:opacity-50` as a minimum, or use a distinct disabled color.

## Implementation Notes

Change `disabled:opacity-15` to `disabled:opacity-40` in the send button's className.

## Resolution

Changed `disabled:opacity-15` to `disabled:opacity-40` on the send button in `input-bar.tsx`. The disabled state is now clearly visible while still looking inactive, meeting WCAG contrast requirements. Deployed to Cloudflare Workers.
