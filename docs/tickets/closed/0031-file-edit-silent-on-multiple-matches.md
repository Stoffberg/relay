# file_edit Silently Replaces Only First Match

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-26

## Description

In `apps/agent/src/tools/file_edit.rs`, the replacement uses `replacen(&args.old, &args.new, 1)` which only replaces the first occurrence. The output says "Replaced 1 occurrence (N total found)" but the LLM often expects all occurrences to be replaced when it sends a file_edit command.

This causes subtle bugs where the LLM thinks it updated all instances of a pattern but only the first one changed. The LLM may not realize the edit was incomplete and move on to the next step.

## Expected Behavior

Two options:

1. **Add a `replace_all` boolean argument**: Default to false (replace first), but allow the LLM to specify `replace_all: true` to replace all occurrences. Update the tool definition sent to the LLM to include this parameter.

2. **Error when multiple matches exist**: If `old` appears more than once and `replace_all` is not set, return an error asking the LLM to provide more context to uniquely identify the target. This is safer because it forces precision.

Option 2 is better for code editing where you want exact targeting. Include surrounding context lines in the error message so the LLM can refine its request.

## Implementation Notes

In `apps/agent/src/tools/file_edit.rs`:

```rust
let count = content.matches(&args.old).count();
if count == 0 {
    return Err(anyhow!("String not found in file"));
}
if count > 1 && !args.replace_all.unwrap_or(false) {
    return Err(anyhow!("Found {} matches. Provide more surrounding context to uniquely identify the target, or set replace_all to true.", count));
}
```

Also update the tool schema in the server's tool definitions to include the `replace_all` parameter.

## Resolution

Added `replace_all: bool` parameter to `file_edit::execute`. When multiple matches are found and `replace_all` is false (default), the tool returns an error telling the LLM to provide more context or set `replace_all: true`. Updated the tool definition in the server to include the `replace_all` parameter in the schema sent to the LLM. Both agent and server deployed.
