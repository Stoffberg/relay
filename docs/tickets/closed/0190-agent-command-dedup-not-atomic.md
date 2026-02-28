# Agent Command Deduplication Check Is Not Atomic

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

In the agent's `run_command_loop`, the deduplication check for in-flight commands uses a `Mutex<HashSet<u64>>` with a non-atomic check-then-insert pattern. Between checking `lock.contains(&cmd.id)` and inserting `lock.insert(cmd.id)`, the mutex is held, but if two `on_insert`/`on_update` events arrive for the same command ID and are processed by different tokio tasks, both could pass the check before either inserts.

In `apps/agent/src/main.rs` around lines 456-461:

```rust
let mut lock = processing.lock().await;
if lock.contains(&cmd.id) {
    continue;
}
lock.insert(cmd.id);
drop(lock);
```

While the mutex is held between check and insert (so they are atomic within a single `recv()` iteration), the issue is that two identical commands could be sent to the channel from the `on_insert` and `on_update` callbacks simultaneously. The channel is unbounded, so both arrive. The first `recv()` processes one, but the second is still in the channel and will be processed next.

Actually, since `recv()` is sequential in the loop, this is safe within a single consumer. The real race is between the `on_insert` and `on_update` callbacks both sending the same command, then the dedup check correctly catches the second one.

However, the `processing.lock().await.remove(&cmd.id)` at the end of the spawned task (line 483) runs asynchronously. If a retry arrives after the first execution starts but before it finishes and removes the ID, it's correctly deduplicated. But if the retry arrives after removal (agent processed it, then server re-dispatches), it's processed again, which is correct behavior.

## Expected Behavior

The current dedup logic is mostly correct for the single-consumer pattern. However, document the assumptions clearly and consider using `HashSet::insert()` which returns `false` if the value already existed, making the check-and-insert truly atomic:

```rust
let mut lock = processing.lock().await;
if !lock.insert(cmd.id) {
    continue; // Already processing
}
drop(lock);
```

## Resolution

Replaced the separate `contains()` + `insert()` calls with a single `HashSet::insert()` that returns false if the value already existed. The check and insert are now a single atomic operation under the mutex lock, eliminating any theoretical window between check and insert. The `processing` set is also cleaned up immediately after tool execution completes.

