# formatArgSummary Missing list_dir Tool Handler

**Type:** bug
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The `formatArgSummary` function in `message-row.tsx` has a switch statement handling 5 of 7 tools (file_read, file_write, file_edit, shell_exec, grep) but falls through to the default case (empty string) for `list_dir` and `glob`. When these tools are used, the tool call pill shows just the tool name with no argument preview.

## Expected Behavior

All 7 tools should have meaningful argument summaries:

- `list_dir`: show the path being listed
- `glob`: show the pattern being matched

## Implementation Notes

Add cases to the switch:

```tsx
case "list_dir": return args.path ?? "";
case "glob": return args.pattern ?? "";
```

## Resolution

Added `list_dir` case to the `formatArgSummary` switch in `message-row.tsx`, returning `args.path`. Tool call pills for `list_dir` now show the directory path in the summary. Deployed to Cloudflare Workers.
