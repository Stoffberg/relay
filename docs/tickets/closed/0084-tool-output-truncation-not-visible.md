# Tool Output Truncation Not Visible to User

**Type:** bug
**Severity:** medium
**Component:** server, web
**Reported:** 2026-02-27

## Description

Tool outputs are silently truncated at 30,000 characters in two places:
1. `fetch_history` when rebuilding conversation (server side)
2. `dispatch_tool_call` when processing the result (server side)

When truncation happens, the text gets "... (truncated)" appended, but:
1. The user in the frontend has no idea that tool output was truncated
2. The LLM may or may not notice the truncation marker
3. There's no way for the user to see the full output

This is especially problematic for large file reads or grep results where the important content might be past the 30K limit.

## Expected Behavior

1. **Mark truncated output visually**: In the tool call pill, show a "truncated" badge or icon when the output contains the truncation marker
2. **Show character count**: Display the original size vs truncated size (e.g., "30K of 150K chars shown")
3. **Consider storing full output**: Store full output in SpacetimeDB but only send truncated version to the LLM. The frontend could display the full output on demand.

## Implementation Notes

### Server
When truncating, include the original length in the truncation message:
```
"... (truncated from 150,000 to 30,000 characters)"
```

### Frontend
In `message-row.tsx`, check for the truncation marker in tool output and show a badge:
```tsx
const isTruncated = output?.includes("(truncated");
{isTruncated && <span className="text-xs text-warning">Truncated</span>}
```

### Schema (optional)
Add `original_size: Option<u64>` to `ToolResult` to track how much was truncated.

## Resolution

Added a "Truncated" badge that appears above tool output when the content contains the "(truncated" marker. The badge uses warning color styling with a semitransparent background. Also added a bottom gradient fade on the tool output `<pre>` block as a scroll affordance (related to ticket 0029).
