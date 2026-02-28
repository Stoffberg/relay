# extractTimestamp Returns 0 for Unrecognized Formats Without Warning

**Type:** bug
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

In `spacetime.ts`, the `extractTimestamp` function returns `0` when it encounters a timestamp format it doesn't recognize. This silently produces `new Date(0)` which is January 1, 1970. Sessions or messages with unrecognized timestamp formats would appear at the bottom of sorted lists or show "55 years ago" in the UI.

There's no console warning or error, so debugging this would be difficult.

## Expected Behavior

When `extractTimestamp` encounters an unrecognized format, it should log a warning with the actual value it received. In development mode, this could be more aggressive (throw or console.error).

## Implementation Notes

Add a fallback with logging:

```tsx
console.warn("extractTimestamp: unrecognized format", ts);
return Date.now(); // or 0, but with the warning
```

## Resolution

Added `console.warn("extractTimestamp: unrecognized format", ts)` in the fallback case and changed the return from `0` to `Date.now()`. Unrecognized formats now log a warning for debugging and return the current time instead of epoch zero, so sessions won't sort to 1970. Deployed to Cloudflare Workers.
