# Grep Silently Skips Unreadable Files

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

In `apps/agent/src/tools/grep.rs` line 28, when a file can't be read (permission denied, binary, etc.), the error is silently swallowed with `Err(_) => return Ok(())`. The LLM receives results without knowing that some files were skipped.

This is problematic because:
1. The LLM might conclude "pattern not found in project" when the matching file was just unreadable
2. Permission issues go undiagnosed
3. Binary files with matching patterns are silently excluded

Similarly, directory read failures at line 49 are silently ignored.

## Expected Behavior

Report skipped files in the output so the LLM knows they weren't searched:

```
path/to/file.rs:10:fn main() {
path/to/file.rs:15:  let main = true;
[Skipped 3 unreadable files]
```

Or include them as a footer note after the results.

## Implementation Notes

In `grep.rs`, count skipped files and include the count in the output:

```rust
let mut skipped = 0;
// ...
Err(_) => { skipped += 1; return Ok(()); }
// ...
if skipped > 0 {
    results.push(format!("[Skipped {} unreadable files]", skipped));
}
```

This gives the LLM enough context to decide if skipped files matter for the task.

## Resolution

Added a `skipped: &mut usize` counter threaded through `grep_file` and `grep_dir`. When `read_to_string` fails on a file, the counter increments instead of silently returning. After the search completes, if any files were skipped, a `[Skipped N unreadable file(s)]` line is appended to the results. Agent binary rebuilt and installed.
