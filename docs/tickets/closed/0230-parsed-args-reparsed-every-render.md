# Tool Call Arguments Re-Parsed on Every Render

**Type:** bug
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

In `message-row.tsx`, `JSON.parse(tc.toolArgs)` is called during every render for every visible tool call to extract the argument summary. This is unnecessary work since tool call arguments are immutable after creation.

With multiple tool calls visible and frequent re-renders during streaming, this adds up.

## Expected Behavior

Parse the arguments once when the tool call data arrives and memoize the result, or use `useMemo` to cache the parsed value.

## Implementation Notes

Either memoize at the component level or parse once in the store when tool calls are added:

```tsx
const parsedArgs = useMemo(() => {
  try { return JSON.parse(tc.toolArgs); }
  catch { return {}; }
}, [tc.toolArgs]);
```

## Resolution

Extracted `ToolCallPill` as a separate component so `useMemo` can be used for `JSON.parse(tc.toolArgs)`. The parsed result is memoized on `[tc.toolArgs, tc.toolName]` so it only re-parses when the args actually change. Deployed to Cloudflare Workers.
