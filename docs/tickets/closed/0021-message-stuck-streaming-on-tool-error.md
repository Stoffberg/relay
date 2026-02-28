# Assistant Message Stuck as "streaming" When Tool Dispatch Fails

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-26

## Description

In `apps/server/src/main.rs`, when `dispatch_tool_call` fails with an error (line 825), the error propagates up via `?` to `run_agent_loop`, which exits immediately. But the assistant message that was created for this loop iteration was set to status "streaming" at creation time and is never updated to "error" or "complete".

The code path is:
1. `run_agent_loop` creates assistant message with status (implicitly streaming after first content arrives)
2. `stream_llm_response` streams text + tool calls successfully
3. `dispatch_tool_call` fails with an `Err`
4. The `?` operator propagates the error out of `run_agent_loop`
5. `run_session_queue` catches the error at line 505 and logs it
6. The assistant message stays "streaming" forever in SpacetimeDB

This means the frontend will show a perpetually streaming message with a blinking cursor that never completes.

## Steps to Reproduce

This requires the agent to be in a specific failure state (e.g., agent crashes mid-tool-execution, or SpacetimeDB reducer fails when creating tool_command). Difficult to reproduce manually but will happen in production when:
1. Agent disconnects while server is dispatching a tool call
2. SpacetimeDB connection drops during tool dispatch
3. The 120s tool timeout is hit and the result is an Err (though currently timeouts return Ok)

## Expected Behavior

When `run_agent_loop` exits with an error, any in-progress assistant message should be marked as "error" with a descriptive error message. Add a cleanup step in `run_session_queue` after catching the agent loop error:

```rust
if let Err(e) = run_agent_loop(state, session_id, &queued.content).await {
    tracing::error!("Agent loop failed for session {session_id}: {e}");
    // Mark any streaming messages as error
    for msg in state.conn.db.message().iter() {
        if msg.session_id == session_id && msg.status == "streaming" {
            let _ = state.conn.reducers.fail_message(msg.id.clone(), e.to_string());
        }
    }
}
```

## Resolution

Added cleanup in run_session_queue after catching agent loop errors. When run_agent_loop returns an Err, the code now iterates all messages for that session and marks any with status 'streaming' as 'error' via fail_message reducer with a descriptive error message. This ensures no messages are left permanently stuck.
