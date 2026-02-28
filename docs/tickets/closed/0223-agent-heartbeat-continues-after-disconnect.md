# Agent Heartbeat Task Runs Forever After Disconnect

**Type:** bug
**Severity:** low
**Component:** agent
**Reported:** 2026-02-27

## Description

The agent's heartbeat task runs in an infinite loop (`loop { sleep(30s); send_heartbeat(); }`) with no cancellation mechanism. When the SpacetimeDB connection drops, the heartbeat task keeps trying to call the `agent_heartbeat` reducer every 30 seconds, logging warnings each time it fails. It serves no purpose since the connection is gone, but it consumes resources and fills logs.

## Expected Behavior

The heartbeat task should stop when the connection is lost. Use a `CancellationToken` or a shutdown channel that gets triggered from the `on_disconnect` callback.

## Implementation Notes

Pass a `tokio_util::sync::CancellationToken` (or a simple `tokio::sync::watch` channel) to the heartbeat task. Cancel it from `on_disconnect`. Also cancel it during graceful shutdown so the heartbeat stops before `agent_disconnect` is called.

## Resolution

Added `tokio_util::sync::CancellationToken` to the agent. The heartbeat loop uses `tokio::select!` to watch both the sleep interval and the cancellation token. On shutdown (after ctrl+c exits the command loop), `shutdown_token.cancel()` is called, which stops the heartbeat before the disconnect reducer runs. Added `tokio-util` as a dependency. Built and installed the agent binary.
