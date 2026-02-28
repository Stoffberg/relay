# Server Uses Full Table Scans Instead of Primary Key Lookups

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

Throughout `main.rs`, the server queries SpacetimeDB tables using `.iter().filter()` or `.iter().find()` instead of using the indexed `.id().find()` method provided by the generated bindings. The SpacetimeDB SDK generates btree index accessors on primary key columns, but the code ignores them in favor of O(n) table scans.

Specific locations in `apps/server/src/main.rs`:

1. **Line ~518**: Checking if message exists: `.iter().any(|m| m.id == user_msg_id)` instead of `.id().find(&user_msg_id).is_some()`

2. **Line ~1279**: Finding tool command by ID in polling loop: `.iter().find(|c| c.id == cmd_id && ...)` instead of `.id().find(&cmd_id)` then checking status

3. **Line ~1287**: Finding tool result by command ID: `.iter().find(|r| r.tool_command_id == cmd_id)` (full scan, no index)

4. **Line ~1230**: Finding max tool command ID: `.iter().map(|c| c.id).max()` scans the entire table just to find the highest ID

5. **Line ~734**: Loading ALL tool results into a Vec: `.iter().collect()` then filtering later

These scans execute on every message sent, every tool dispatch, and every history fetch. As the database grows, performance degrades linearly.

## Expected Behavior

Use the generated index accessors wherever possible:

```rust
// Instead of: conn.db.message().iter().any(|m| m.id == id)
// Use:
conn.db.message().id().find(&id).is_some()

// Instead of: conn.db.tool_command().iter().find(|c| c.id == cmd_id)
// Use:
conn.db.tool_command().id().find(&cmd_id)
```

For non-primary-key lookups (like `session_id`, `message_id`), add secondary indexes to the schema (ticket 0012) and use the generated accessors.

## Implementation Notes

This is related to ticket 0012 (add indexes) and ticket 0028 (O(n) lookups), but is specifically about using existing SDK features that are already available via the generated bindings. The primary key indexes already exist; they're just not being called.

Review every `.iter()` call in `main.rs` and replace with `.id().find()` where looking up by primary key.

## Resolution

Replaced `.iter().any(|m| m.id == id)` with `.id().find(&id).is_some()` for the duplicate message check. Replaced `.iter().find(|c| c.id == cmd_id)` with `.id().find(&cmd_id)` for tool command polling. Other iter patterns filter on non-PK fields (session_id, message_id) which require secondary indexes (ticket 0012) to optimize further.

