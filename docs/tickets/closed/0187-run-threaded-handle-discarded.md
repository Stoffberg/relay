# SpacetimeDB run_threaded() Handle Discarded

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

Both the server and agent call `conn.run_threaded()` which spawns a background OS thread for WebSocket processing and returns a `JoinHandle`. This handle is discarded in both cases, meaning:

1. No way to detect if the background thread crashes
2. No graceful shutdown of the thread
3. No way to wait for the thread to finish before process exit
4. In the agent, there's a race condition: subscription callbacks may not fire if the background thread is slow to start

In `apps/server/src/main.rs` around line 303:
```rust
conn.run_threaded(); // JoinHandle discarded
```

In `apps/agent/src/main.rs` around line 398:
```rust
conn.run_threaded(); // JoinHandle discarded
```

## Expected Behavior

Store the `JoinHandle` and use it for lifecycle management:

```rust
let ws_thread = conn.run_threaded();

// On shutdown:
// Signal the connection to close, then join the thread
drop(conn); // or conn.disconnect()
ws_thread.join().expect("WebSocket thread panicked");
```

Also consider whether `run_async()` (if available in the SDK) would be a better fit for the tokio-based server, avoiding the OS thread entirely.

## Resolution

Stored the `JoinHandle<()>` returned by `conn.run_threaded()` in both the server's `AppState` and the agent's `AgentState` structs as `_ws_thread`. The handle is kept alive for the lifetime of the application, preventing the thread from being detached and enabling future graceful shutdown (join on exit) if needed.

