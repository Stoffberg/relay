# Add System Prompt Customization Per Session

**Type:** feature
**Severity:** medium
**Component:** server, web
**Reported:** 2026-02-27

## Description

The system prompt is hardcoded in the server for all sessions. Users can't customize the AI's behavior for different use cases. For example:
1. A coding session might want: "You are a senior Rust developer. Be concise."
2. A writing session might want: "You are a creative writing assistant. Be expressive."
3. A debugging session might want: "Always check error handling and edge cases first."

## Expected Behavior

1. Add a `system_prompt` field to the Session table (nullable, uses default when null)
2. Add a UI to edit the system prompt per session (settings icon in chat header)
3. The server appends the custom prompt to the base system prompt (doesn't replace it, so tool instructions are preserved)
4. Show the active system prompt somewhere accessible (e.g., in session settings)

## Implementation Notes

### Schema
Add `system_prompt: Option<String>` to `Session`. Add `update_session_system_prompt` reducer.

### Server
In `run_agent_loop` when building the system message, if the session has a custom prompt, append it after the base prompt:

```rust
let mut system = base_system_prompt.to_string();
if let Some(custom) = &session.system_prompt {
    system.push_str("\n\nAdditional instructions from user:\n");
    system.push_str(custom);
}
```

### Frontend
Add a "System prompt" button/icon in the chat header. Opens a modal or expandable section with a textarea for editing. Saves via the reducer.

Consider pre-made templates: "Concise coder", "Creative writer", "Code reviewer", etc.

## Resolution

Added `system_prompt: Option<String>` to Session table and `update_session_system_prompt` reducer. Server's `agent_loop.rs` reads the session system prompt and appends it to the base system prompt with "Additional instructions from user:" prefix. Frontend has a "prompt" button in the chat header (highlighted as "prompt*" when a custom prompt is set). Clicking opens a `SystemPromptEditor` panel with a textarea, save/cancel/clear buttons, and Cmd+Enter shortcut. The prompt is appended to (not replacing) the default system prompt, preserving tool instructions.
