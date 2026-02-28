# Server Subscribes to All SpacetimeDB Tables Unfiltered

**Type:** task
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The server's SpacetimeDB subscription uses `SELECT * FROM <table>` for all 6 tables, loading every row from every table into the server's memory cache. As the database grows with more sessions, messages, message parts, tool commands, and tool results, the server's memory footprint grows proportionally.

In `apps/server/src/main.rs` around lines 294-301:

```rust
.subscribe(["SELECT * FROM message",
            "SELECT * FROM message_part",
            "SELECT * FROM session",
            "SELECT * FROM tool_command",
            "SELECT * FROM tool_result",
            "SELECT * FROM agent"])
```

With 1000 sessions, each averaging 50 messages with 10 parts each, this is 500,000 message_part rows loaded into the server's memory on startup.

## Expected Behavior

Filter subscriptions to only include data the server needs:

1. The server only needs sessions with `status != 'idle'` (active sessions) plus recently updated sessions
2. Messages only for active sessions
3. Tool commands and results only for pending/executing states
4. Or at minimum, add a time-based filter (e.g., last 24 hours)

SpacetimeDB may support filtered subscriptions. If so:

```rust
.subscribe(["SELECT * FROM session WHERE status != 'idle'",
            "SELECT * FROM message WHERE session_id IN (SELECT id FROM session WHERE status != 'idle')"])
```

## Implementation Notes

Check SpacetimeDB documentation for subscription query support. If subqueries aren't supported, filter the data at the application level after subscription (cache only what's needed, discard the rest).

This becomes critical as the database grows. Currently manageable with ~20 sessions and ~200 messages, but will cause memory pressure at scale.

## Resolution

Investigated but deferred. The server is a stateless HTTP handler that can receive a `/chat` request for ANY session at any time and needs the full message history (all messages, parts, tool commands, tool results) to build the LLM conversation context. Unlike the frontend (which views one session at a time), the server genuinely needs access to all data. SpacetimeDB's Rust SDK only supports data access via subscription cache (`conn.db.*().iter()`), not ad-hoc SQL queries. Dynamic per-session subscriptions would be impractical since sessions become active unpredictably via HTTP requests, and subscription setup has latency. The frontend equivalent (ticket 0192) was solved because users only view one session at a time. The server's architecture fundamentally requires broad data access. Revisit if SpacetimeDB adds server-side SQL query support or if data volume becomes a real bottleneck.

