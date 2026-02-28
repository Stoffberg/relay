# Agent Has No Reconnection Logic on SpacetimeDB Disconnect

**Type:** bug
**Severity:** high
**Component:** agent
**Reported:** 2026-02-27

## Description

When the SpacetimeDB WebSocket connection drops, the agent's `on_disconnect` callback logs an error but takes no further action. The command loop's channel receiver never closes (the sender is held by the SDK callbacks which are now dead), so the agent hangs forever waiting for commands that will never arrive. The process stays alive but is effectively dead.

The heartbeat task also keeps running, logging warnings every 30 seconds as the reducer calls fail, but serving no purpose since the connection is gone.

Note: ticket 0008 (open) covers frontend SpacetimeDB reconnection. This is specifically about the agent, which has different reconnection requirements (re-register, re-subscribe, resume command processing).

## Expected Behavior

On disconnect, the agent should attempt to reconnect with exponential backoff. On successful reconnection, it should re-subscribe to tables, re-register itself, and scan for any pending commands that arrived while disconnected.

## Implementation Notes

The `on_disconnect` callback should signal the main loop to enter a reconnection state. Use a flag or channel to break the command loop, then retry `DbConnection::builder().build()` with backoff. After reconnecting, repeat the full initialization sequence (subscribe, wait for applied, register, scan pending).

## Resolution

Wrapped the entire connect→subscribe→register→command_loop sequence in an outer retry loop with exponential backoff (1s, 2s, 4s... up to 30s, max 10 attempts). On disconnect, the `disconnected` AtomicBool flag breaks the command loop, which returns inflight task handles. After draining inflight tasks and calling agent_disconnect, the outer loop retries the full connection sequence. On successful reconnect, retry count resets to 0. Ctrl+C sets a `shutdown_requested` flag that breaks the outer loop cleanly.
