# Grep Tool Output Size Unbounded Per Match Line

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

The grep tool limits results to 500 matches (`MAX_MATCHES`), but each match line can be arbitrarily long. If a file has very long lines (e.g., minified JavaScript, base64-encoded data), a single match line could be megabytes. With 500 such matches, the result string can be enormous, potentially exhausting agent memory.

In `apps/agent/src/tools/grep.rs`, match lines are collected without truncation:

```rust
results.push(format!("{}:{}:{}", path, line_num, line_content));
```

## Expected Behavior

Truncate individual match lines to a reasonable length (e.g., 500 characters) with an indicator:

```rust
let truncated = if line_content.len() > 500 {
    format!("{}... (truncated)", &line_content[..500])
} else {
    line_content.to_string()
};
```

## Resolution

Truncated individual match lines in `grep_file` to 500 characters. Lines exceeding that limit are cut with a `... (line truncated)` suffix. This caps per match memory usage and keeps grep output reasonable even when matching inside minified files.

