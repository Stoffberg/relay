# No State Machine Validation for Message and Session Status Transitions

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The `update_session_status` and message lifecycle reducers (`complete_message`, `fail_message`) accept any valid status value regardless of the current status. There's no state machine enforcing valid transitions.

For messages:
- A "complete" message can be set back to "error" via `fail_message`
- A "queued" message can be completed without ever going through "streaming"
- An "error" message can be completed

For sessions:
- A session can go from "idle" to "error" (skipping streaming)
- A session can go from "error" to "idle" (recovering without explicit acknowledgment)
- A session can oscillate between any two states

In `packages/spacetime/src/lib.rs`, `update_session_status` (line 101) validates the new status value but not the transition:

```rust
if !["idle", "streaming", "waiting_for_tool", "error"].contains(&new_status.as_str()) {
    return Err("Invalid session status".to_string());
}
```

## Expected Behavior

Enforce valid state transitions:

Messages: `queued → streaming → complete`, `queued → error`, `streaming → error`
Sessions: `idle → streaming → idle`, `streaming → waiting_for_tool → streaming`, `* → error`, `error → idle`

Invalid transitions should return an error.

## Implementation Notes

A simple match on `(current_status, new_status)` pairs is sufficient. This prevents buggy server code from accidentally corrupting session or message state.

## Resolution

Added state machine validation for both session and message status transitions. Session transitions enforced via `is_valid_session_transition`: idle→streaming, streaming→idle, streaming→waiting_for_tool, waiting_for_tool→streaming, any→error, error→idle. Message completion restricted to queued/streaming status via `is_valid_message_completion`, failure restricted to queued/streaming via `is_valid_message_failure`. Invalid transitions return descriptive errors.

