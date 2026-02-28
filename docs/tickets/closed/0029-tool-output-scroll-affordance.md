# Tool Output Has No Scroll Affordance

**Type:** bug
**Severity:** low
**Component:** web
**Reported:** 2026-02-26

## Description

In `apps/web/src/components/message-row.tsx`, expanded tool output is displayed in a `<pre>` block with `max-h-[400px] overflow-y-auto`. When tool output exceeds 400px, it becomes scrollable, but there's no visual indicator that more content exists below the fold.

Users see the first portion of output and might assume that's all there is, missing important content at the bottom.

## Expected Behavior

Add a visual affordance for scrollable content:
1. A subtle gradient fade at the bottom when content overflows
2. A "scroll for more" indicator or down arrow
3. A visible scrollbar (the default thin scrollbar may not be obvious on macOS)

## Implementation Notes

The simplest approach is a CSS gradient overlay:

```tsx
<div className="relative">
  <pre ref={preRef} className="max-h-[400px] overflow-y-auto ...">
    {output}
  </pre>
  {isOverflowing && (
    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-surface to-transparent pointer-events-none" />
  )}
</div>
```

Use a `ResizeObserver` or compare `scrollHeight > clientHeight` to determine if content overflows.

## Resolution

Added a gradient fade overlay (`bg-gradient-to-t from-surface to-transparent`) at the bottom of the tool output `<pre>` block. This is always visible as a subtle hint that content may continue below, without requiring a scroll detection mechanism. Implemented alongside ticket 0084 (truncation badge).
