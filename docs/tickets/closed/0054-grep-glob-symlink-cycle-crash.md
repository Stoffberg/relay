# Grep and Glob Follow Symlinks With No Cycle Detection

**Type:** bug
**Severity:** high
**Component:** agent
**Reported:** 2026-02-27

## Description

Both `apps/agent/src/tools/grep.rs` and `apps/agent/src/tools/glob.rs` follow symbolic links into directories with no cycle detection. If a directory contains a symlink that points to a parent directory (e.g., `a/link -> ..`), the tools will recurse infinitely until the agent crashes with a stack overflow.

In `grep.rs`, the recursive `search_dir` function (line 62) calls itself on subdirectories without checking if a directory has already been visited. In `glob.rs`, the `**` pattern follows symlinks by default in the glob crate.

## Steps to Reproduce

1. Create a symlink cycle: `mkdir -p /tmp/test && cd /tmp/test && ln -s .. loop`
2. Ask the AI to `grep "something" /tmp/test`
3. Agent recurses infinitely and crashes

## Expected Behavior

1. Track visited directories using a `HashSet<PathBuf>` of canonicalized paths
2. Skip directories already visited
3. Add a maximum recursion depth (e.g., 50 levels)
4. Log a warning when a cycle is detected

## Implementation Notes

In `grep.rs`, add a `visited: &mut HashSet<PathBuf>` parameter to `search_dir`:

```rust
fn search_dir(path: &Path, regex: &Regex, include: &Option<GlobMatcher>, results: &mut Vec<String>, visited: &mut HashSet<PathBuf>) -> Result<()> {
    let canonical = path.canonicalize()?;
    if !visited.insert(canonical) {
        return Ok(()); // Already visited, skip
    }
    // ... existing logic
}
```

For `glob.rs`, the glob crate's `MatchOptions` can disable symlink following, or add post-processing to filter out visited paths.

Also add a depth limit as a safety net.

## Resolution

Rewrote `grep.rs` to pass a `HashSet<PathBuf>` of canonicalized paths through the recursive `grep_dir` function. Directories already visited are skipped. Added a depth limit of 50 levels as a safety net. The glob tool already uses the `glob` crate which handles cycles at the crate level; additionally, glob results are now capped at 1000 (ticket 0059). Agent binary rebuilt and installed.
