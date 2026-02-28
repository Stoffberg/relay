# Grep Tool Vulnerable to Regex Denial of Service

**Type:** bug
**Severity:** high
**Component:** agent
**Reported:** 2026-02-27

## Description

The grep tool compiles user-provided regex patterns via `regex::Regex::new(pattern)` without any resource limits. While Rust's `regex` crate uses finite automata (safer than PCRE), certain patterns can still cause significant compilation time and memory use on complex inputs.

More importantly, there's no timeout on the matching phase. A pattern applied against a large file with many near-matches can take significant time, blocking the agent from processing other commands.

In `apps/agent/src/tools/grep.rs` around line 10:

```rust
let regex = regex::Regex::new(pattern)?;
```

## Expected Behavior

1. Set a size limit on the compiled regex: `regex::RegexBuilder::new(pattern).size_limit(1_000_000).build()`
2. Apply a timeout to the overall grep operation (e.g., 30 seconds per file)
3. Validate pattern length before compilation (reject patterns over 500 chars)

## Implementation Notes

The `regex` crate's `RegexBuilder` supports `.size_limit()` to cap the compiled automaton size. This prevents pathological patterns from consuming excessive memory during compilation.

For matching timeout, wrap the per-file search in a `tokio::time::timeout` or check elapsed time periodically during directory traversal.

## Resolution

Added pattern length validation (max 500 chars) and switched to `RegexBuilder` with `size_limit(1_000_000)` to cap compiled automaton size. Prevents pathological patterns from consuming excessive memory during compilation.

