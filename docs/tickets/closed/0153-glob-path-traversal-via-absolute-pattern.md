# Glob Tool Allows Path Traversal via Absolute or Relative Patterns

**Type:** bug
**Severity:** high
**Component:** agent
**Reported:** 2026-02-27

## Description

The glob tool constructs the search pattern by prepending a base directory, but if the pattern starts with `/`, it's used as-is, bypassing the base directory entirely. Patterns containing `../../` sequences also traverse outside the intended directory.

In `apps/agent/src/tools/glob.rs` around lines 13-17:

```rust
let full_pattern = if pattern.starts_with('/') {
    pattern.to_string()
} else {
    format!("{}/{}", base.display(), pattern)
};
```

This is distinct from ticket 0112 (file tools path traversal) because glob doesn't operate on a single path but on a search pattern that can match arbitrary filesystem locations.

## Steps to Reproduce

1. Ask the LLM to search with pattern `/etc/*`
2. Glob returns all files in `/etc/`
3. Or use `../../etc/passwd` as pattern from any base directory

## Expected Behavior

1. Reject absolute patterns unless they start with the configured workspace root
2. Resolve the full pattern path and verify it stays within the allowed directory
3. Apply the same `validate_path` function proposed in ticket 0112

## Resolution

Patterns containing `..` are now rejected. Absolute patterns are validated to ensure they start within the canonicalized base directory. Prevents glob searches from escaping the intended directory tree.

