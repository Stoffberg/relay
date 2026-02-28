# Agent Processing Set Not Cleaned When Tool Times Out

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

In the agent's `run_command_loop`, each tool command ID is added to a `processing` HashSet before execution and removed after completion. If the tool execution times out (after 110 seconds), the spawned task may still be running the actual process, and the cleanup code at the end of the task never executes.

In `apps/agent/src/main.rs` around lines 422-484:

```rust
let mut lock = processing.lock().await;
lock.insert(cmd.id);
drop(lock);

tokio::spawn(async move {
    // ... execute with timeout ...
    // If timeout fires, this may not reach:
    processing.lock().await.remove(&cmd.id);
});
```

If the same command ID is retried (e.g., server re-dispatches after its own timeout), the agent silently skips it because it's still in the `processing` set. The command is permanently stuck.

## Expected Behavior

Always remove the command ID from the `processing` set, even on timeout. Use a `finally`-style cleanup pattern:

```rust
let result = tokio::time::timeout(Duration::from_secs(110), execute_tool(...)).await;
processing.lock().await.remove(&cmd.id);
match result { ... }
```

## Resolution

Moved `processing.lock().await.remove(&cmd.id)` to execute immediately after the timeout/result resolution, before the match block that reports results. This ensures the processing set is always cleaned up regardless of whether the tool succeeded, failed, or timed out.

