# Add Connection Quality Indicator

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The connection indicator in the sidebar shows binary states: connected/disconnected/connecting/error. But it doesn't show the quality of the connection. SpacetimeDB subscription latency can vary significantly (50ms to 500ms+), affecting the real-time feel of the app.

## Expected Behavior

Show connection latency alongside the status indicator:
1. Green dot + "45ms" for fast connections
2. Yellow dot + "350ms" for slow connections
3. Red dot + "disconnected" for no connection
4. Update periodically (every 10 seconds)

## Implementation Notes

Measure round-trip time by:
1. Calling a lightweight reducer (e.g., `agent_heartbeat` style ping) and timing the subscription update
2. Or tracking the delay between calling a reducer and seeing the subscription callback

Store the last few measurements and show the average.

In `sidebar.tsx` ConnectionIndicator:
```tsx
<span className="text-xs text-muted font-mono">{latency}ms</span>
```

This is especially useful for diagnosing performance issues: if the connection is slow, the user knows to check their network rather than blaming the AI.

## Resolution

Added connection quality indicator to the sidebar. Tracks `lastEventTime` in `spacetime.ts` updated on every SpacetimeDB event. Sidebar displays the age since last event (e.g., "connected · 3s ago") next to the connection dot. Dot turns yellow when the last event is over 60 seconds old, giving a visual staleness indicator without needing a dedicated ping reducer.
