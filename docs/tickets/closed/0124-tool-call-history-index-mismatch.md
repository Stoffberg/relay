# Tool Call History Index Mismatch in fetch_history

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

In `fetch_history`, when reconstructing tool call messages for conversation history, the code iterates `msg_tool_calls` (from the database) with `enumerate()` and uses the loop index `i` to look up the corresponding entry in the `tc` array (the tool_calls vector stored during streaming). If the original streaming had index gaps (e.g., indices 0 and 5, creating a 6-element vector with 4 empty entries), the enumerated database commands (which only store the 2 real commands) don't align with the array positions.

In `apps/server/src/main.rs` around lines 751-777:

```rust
for (i, cmd) in msg_tool_calls.iter().enumerate() {
    // tc[i] may be the wrong ToolCall if there were gaps
}
```

Example failure: Stream returns tool_calls at indices [0, 5]. Database stores 2 tool_commands. `fetch_history` enumerates them as i=0, i=1. `tc[0]` is correct but `tc[1]` is an empty placeholder (the real second call is at `tc[5]`). The tool message gets the wrong `tool_call_id`.

## Expected Behavior

Match tool_commands to tool_calls by tool name and/or stored tool_call_id, not by enumeration index. Alternatively, store the original streaming index or tool_call_id in the `tool_command` table for reliable reconstruction.

## Implementation Notes

The cleanest fix is to store the LLM's `tool_call_id` (the `call_xyz` string) in the `tool_command` table. Then `fetch_history` matches by ID instead of positional index. This requires a schema change to add a `tool_call_id` column to the `tool_command` table.

## Resolution

Added `tool_call_id` field to the `ToolCommand` table in the SpacetimeDB schema. The server now passes the LLM's original tool_call_id when creating tool commands, and `fetch_history` uses this stored ID (falling back to `call_{db_id}` for backwards compatibility with empty values). This ensures tool result messages in conversation history match the tool_call IDs the LLM originally generated, eliminating index mismatch issues. Regenerated bindings for all three targets and deployed.

