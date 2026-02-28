# fail_message Uses Hardcoded part_index 9999 That Can Collide

**Type:** bug
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The `fail_message` reducer stores the error as a `MessagePart` with a hardcoded `part_index: 9999`. If a message somehow has 10000+ parts (unlikely but possible with very long streaming responses), or if `fail_message` is called twice on the same message, this creates duplicate or colliding entries at index 9999.

In `packages/spacetime/src/lib.rs` around line 177:

```rust
ctx.db.message_part().insert(MessagePart {
    id: 0,
    message_id: message_id.clone(),
    part_index: 9999,
    content: error,
});
```

Calling `fail_message` twice creates two `MessagePart` rows both with `part_index: 9999`, which causes the error text to appear duplicated when content is reconstructed.

## Expected Behavior

Use a dedicated error field on the `Message` table instead of encoding errors as message parts. Alternatively, use a dynamically computed part_index (e.g., `max(existing_parts) + 1`).

## Implementation Notes

The cleanest fix is adding an `error` field (nullable String) to the `Message` table. This avoids the part_index hack entirely. The schema change would require binding regeneration for all three targets.

A simpler fix: check if an error part already exists before inserting, or use `u32::MAX` which is less likely to collide.

## Resolution

Added `error: Option<String>` field to the `Message` table. The `fail_message` reducer now stores the error directly on the message instead of inserting a `MessagePart` with hardcoded `part_index: 9999`. The server's `fetch_history` appends the error field to the message text when present. Eliminates the collision risk and duplicate error text issues.

