# Glob Results Allocation Is Unbounded

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

In `apps/agent/src/tools/glob.rs`, the glob results vector grows without limit. A pattern like `**/*` on a large filesystem (millions of files) will allocate an unbounded amount of memory, potentially crashing the agent.

Unlike grep which has a 500 match limit (even if it's silent), glob has no cap at all. The sorting step also operates on the full unbounded list.

Additionally, if `std::env::current_dir()` fails, the fallback is `/` (root), which combined with a broad pattern could return the entire filesystem.

## Expected Behavior

1. Cap glob results at a reasonable limit (e.g., 1000 matches)
2. Show a truncation message when the limit is hit
3. Don't fall back to `/` when current_dir fails; return an error instead

## Implementation Notes

In `glob.rs`:

```rust
const MAX_MATCHES: usize = 1000;

for entry in glob::glob(&full_pattern)? {
    if matches.len() >= MAX_MATCHES {
        matches.push(format!("[Truncated: more than {} matches]", MAX_MATCHES));
        break;
    }
    // ... existing logic
}
```

For the current_dir fallback:
```rust
let base = std::env::current_dir()
    .map_err(|e| anyhow!("Cannot determine current directory: {e}"))?;
```

## Resolution

Added `MAX_MATCHES = 1000` constant. The glob loop breaks early when the cap is hit and appends a `[Truncated: more than 1000 matches]` marker. Replaced the `/` fallback when `current_dir()` fails with a proper error return. Agent binary rebuilt and installed.
