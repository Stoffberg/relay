# Tool Call Pill Buttons Missing aria-expanded Attribute

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The expand/collapse button on tool call pills in `message-row.tsx` has no `aria-expanded` attribute. Screen readers cannot communicate whether the tool call output panel is expanded or collapsed. The button also lacks a visible `:focus-visible` style for keyboard users.

In `apps/web/src/components/message-row.tsx` around line 70-112:

```typescript
<button type="button" onClick={toggle}>
    {/* ... tool name and status ... */}
</button>
```

Missing `aria-expanded={isExpanded}` on the button element.

## Expected Behavior

Add accessibility attributes:

```typescript
<button
    type="button"
    onClick={toggle}
    aria-expanded={isExpanded}
    aria-label={`${tc.name} tool call, ${isError ? "failed" : "succeeded"}`}
>
```

This is distinct from ticket 0057 (general missing ARIA labels) and ticket 0118 (color-only status). This specifically covers the expand/collapse interaction pattern.

## Resolution

Added `aria-expanded={isExpanded}` and `aria-label` to the tool call pill button in `message-row.tsx`. The aria label communicates the tool name and current status (failed, running, or succeeded) to screen readers.

