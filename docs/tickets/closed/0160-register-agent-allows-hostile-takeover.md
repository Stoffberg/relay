# register_agent Allows Hostile Agent Takeover

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

The `register_agent` reducer allows any caller to re-register an existing `agent_id`, updating its status to "online" and resetting its heartbeat timestamp. There is no verification that the caller is the original registrant.

In `packages/spacetime/src/lib.rs` around lines 270-286:

If the agent already exists (line 271), the reducer simply updates its status and heartbeat without checking `ctx.sender()` against the agent's `user_id`. A malicious client connected to SpacetimeDB can:

1. Observe an agent_id from the `agent` table
2. Call `register_agent` with that ID
3. The agent is now "owned" by the attacker's connection
4. Tool commands dispatched to that agent_id may be intercepted

## Expected Behavior

When re-registering an existing agent, verify `ctx.sender()` matches the agent's `user_id`:

```rust
if let Some(existing) = ctx.db.agent().id().find(&agent_id) {
    if existing.user_id != ctx.sender() {
        return Err(format!("Agent {} belongs to a different user", agent_id));
    }
    // ... update status
}
```

## Implementation Notes

This is closely related to ticket 0013 (authorization checks on reducers) but is a specific, exploitable vulnerability rather than a general missing-auth pattern. The agent takeover could allow an attacker to see tool command arguments (which may contain file paths, code, or sensitive data) and return malicious tool results.

## Resolution

Added `ctx.sender()` ownership check in `register_agent` reducer. When re-registering an existing agent, the reducer now verifies `existing.user_id != ctx.sender()` and returns an error if they don't match. New registrations still work normally since `user_id` is set from `ctx.sender()` on first creation.

