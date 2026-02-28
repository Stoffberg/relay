# Add Stop Generation Button

**Type:** feature
**Severity:** high
**Component:** server, web
**Reported:** 2026-02-27

## Description

When the AI is generating a long response or executing a chain of tool calls, there's no way to stop it. The user has to wait for the entire response to finish, even if they realize after the first few lines that it's going in the wrong direction.

This is especially frustrating during long tool call chains (up to 20 iterations) where each tool call can take seconds.

## Expected Behavior

1. Show a "Stop" button in place of or next to the send button while the AI is responding
2. Clicking it cancels the current generation
3. The partial response is kept (marked as complete with whatever was streamed so far)
4. The session returns to idle state

## Implementation Notes

### Server
Add a new HTTP endpoint `POST /stop` that accepts `{ session_id }`:
1. Set a cancellation flag for the session (e.g., in a `CancellationToken` map keyed by session_id)
2. In `run_agent_loop`, check the cancellation flag before each LLM call and each tool dispatch
3. If cancelled, mark the current assistant message as "complete" with whatever content exists, set session to "idle"
4. Return 200 OK

Alternative: Use SpacetimeDB. Frontend calls an `update_session_status` reducer to set status to "cancelling". Server checks for this status in the loop.

### Frontend
In the input bar, when `sessionStatus` is "streaming" or "waiting_for_tool", show a stop button:

```tsx
{isBusy ? (
  <button onClick={handleStop} aria-label="Stop generation">■</button>
) : (
  <button onClick={handleSend} aria-label="Send message">→</button>
)}
```

This is a high-impact UX improvement. Users of every other chat interface expect this functionality.

## Resolution

Added `POST /stop` endpoint on the server that sets a per-session cancellation flag (`Arc<AtomicBool>` in a `HashMap`). The `run_agent_loop` checks the flag before each LLM call and before each tool dispatch. When cancelled, the current streaming message is completed (not failed) with whatever content exists, preserving partial responses. On the frontend, the input bar shows a red square stop button when sessionStatus is "streaming" or "waiting_for_tool", replacing the send arrow. The stop button fires a fetch to `/stop` with the session_id.
