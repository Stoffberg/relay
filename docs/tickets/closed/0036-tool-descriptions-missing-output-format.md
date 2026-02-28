# Tool Descriptions Don't Document Output Format or Truncation

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

The tool definitions sent to the LLM (lines 138-249 in `apps/server/src/main.rs`) are missing critical information:

1. **Output truncation not documented**: Tool outputs are silently truncated at 30,000 characters (in both `fetch_history` and `dispatch_tool_call`), but the tool descriptions say nothing about this. The LLM may produce incorrect analysis thinking the output is complete when it's been cut off.

2. **shell_exec doesn't document stderr handling**: The description says "Execute a shell command and return its output" but doesn't explain that stderr is included in the output for successful commands, or that exit codes are shown on failure. The system prompt mentions trusting tool results, but the tool description itself is silent.

3. **file_read output format unclear**: Returns line-numbered content but the description doesn't mention this. The LLM may try to parse the output as raw file content.

4. **workdir parameter for shell_exec has no default documented**: The description doesn't say what happens when workdir is omitted (defaults to home directory).

5. **grep result format undocumented**: The LLM doesn't know if results include file paths, line numbers, match context, or just filenames.

## Expected Behavior

Improve tool descriptions to include output format and limitations. For example:

```
"shell_exec": "Execute a shell command. Returns stdout (and stderr on success). On failure, returns exit code and stderr. Output is truncated at 30000 characters. Default working directory is the user's home directory."
```

## Implementation Notes

In `apps/server/src/main.rs` in the `tool_definitions()` function, update each tool's description string to include:
1. What the output looks like
2. The 30000 char truncation limit
3. Default values for optional parameters
4. Common gotchas (stderr behavior, line numbers in file_read, etc.)

Keep descriptions concise. The LLM doesn't need a manual, just enough to use the tools correctly.

## Resolution

Updated all 7 tool descriptions in tool_definitions() to include output format, truncation limits (30000 chars for all tools, 1MB for shell_exec), default values for optional params, and behavioral notes (grep format, file_read line numbers, shell_exec stderr handling). Server deployed.
