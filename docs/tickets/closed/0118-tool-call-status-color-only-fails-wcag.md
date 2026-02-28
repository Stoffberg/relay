# Tool Call Error Status Indicated by Color Only

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

In `message-row.tsx`, tool call success/error status is communicated solely through border color (red for error, default for success). This fails WCAG 1.4.1 (Use of Color), which requires that color is not the only visual means of conveying information.

Around line 76-95:

```typescript
<div style={{
    borderColor: isError ? "var(--danger)" : "var(--border)",
}}>
```

Colorblind users (particularly those with red-green deficiency, ~8% of males) cannot distinguish error state from normal state.

## Expected Behavior

Add a text or icon indicator alongside the color change:
- Show "Failed" or an error icon (e.g., a warning triangle) next to the tool name when `isError` is true
- Consider adding `role="alert"` to error tool results so screen readers announce them

## Implementation Notes

A small text badge or icon next to the tool name in the pill would satisfy WCAG. Something like:

```typescript
{isError && <span className="text-danger text-[10px]">failed</span>}
```

This also relates to ticket 0057 (missing ARIA labels) but is a distinct WCAG violation specific to color-only status indication.

## Resolution

Added a "failed" text badge (`<span className="text-[10px] font-medium text-danger">failed</span>`) next to the tool name in the pill when `isError` is true. This provides a text indicator alongside the red border color, satisfying WCAG 1.4.1 (Use of Color).

