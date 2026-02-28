# Add Agent Online Indicator in Chat UI

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The server dynamically adjusts the LLM's system prompt and tool availability based on whether an agent is online. But the user has no way to know if tools are available or not. They might ask the AI to "read this file" and get a response saying "I don't have access to your machine" without understanding why.

## Expected Behavior

Show an agent status indicator somewhere visible in the chat UI:

1. A small icon/badge in the chat header or near the input bar showing "Agent connected" (green) or "No agent" (gray)
2. When the agent goes offline mid-conversation, show a brief notification
3. Clicking the indicator shows info about the connected agent (name, capabilities)

## Implementation Notes

The frontend already subscribes to the `agent` table via SpacetimeDB. In `__root.tsx`, there's already agent listener logic.

1. Expose `hasOnlineAgent` as a property from the root route context or via the SpacetimeDB helpers
2. In the chat route, read this property and render an indicator
3. Use the agent's `name` and `last_heartbeat` for the tooltip/details

A simple implementation:
```tsx
<div className="flex items-center gap-1.5 text-xs">
  <span className={cn("w-2 h-2 rounded-full", hasAgent ? "bg-green-500" : "bg-muted")} />
  <span className="text-muted">{hasAgent ? "Agent connected" : "No agent"}</span>
</div>
```

Place it in the chat header area or next to the input bar.

## Resolution

Added agent status indicator in the top-right corner of the chat area. Shows green dot + "agent" when an agent is online, dim dot + "no agent" when offline. Subscribes to SpacetimeDB agent table events for real time updates via `addListener({ onAgentInsert, onAgentUpdate })`.
