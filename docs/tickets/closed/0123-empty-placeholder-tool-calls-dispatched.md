# Empty Placeholder Tool Calls Dispatched to Agent

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

In `stream_llm_response`, when tool call streaming chunks arrive with non-sequential indices (e.g., index 0 then index 5), the code pads the `tool_calls` vector with empty `ToolCall` structs to fill the gap. These empty placeholders have blank `id`, empty `function.name`, and empty `arguments`.

In `apps/server/src/main.rs` around lines 1124-1133:

```rust
while tool_calls.len() <= idx {
    tool_calls.push(ToolCall { id: String::new(), function: ToolFunction { name: String::new(), arguments: String::new() } });
}
```

The entire vector (including empty placeholders) is returned at line 1156 without filtering. In `run_agent_loop`, `for tool_call in &tool_calls` iterates all entries including empties, causing `dispatch_tool_call` to create tool commands with blank tool names.

## Expected Behavior

Filter out empty/placeholder tool calls before returning from `stream_llm_response`:

```rust
tool_calls.retain(|tc| !tc.id.is_empty() && !tc.function.name.is_empty());
```

## Resolution

Added `tool_calls.retain(|tc| !tc.id.is_empty() && !tc.function.name.is_empty())` before the validation block in `stream_llm_response`. Empty placeholder entries from index gaps are now filtered out before tool calls are returned or dispatched.

