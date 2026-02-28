# list_dir Tool Does Not Show Symlink Targets

**Type:** task
**Severity:** low
**Component:** agent
**Reported:** 2026-02-27

## Description

The `list_dir` tool detects symlinks and labels them as `"(symlink)"` in the output, but does not show what the symlink points to. When a user or the LLM is exploring a directory structure, knowing the symlink target is essential for understanding the layout.

In `apps/agent/src/tools/list_dir.rs` around line 24:

The symlink is detected via `metadata.file_type().is_symlink()` but no call to `std::fs::read_link()` is made to resolve the target path.

## Expected Behavior

Show the symlink target:

```
node_modules -> /usr/local/lib/node_modules (symlink)
.config -> /home/user/.config (symlink)
```

Using `std::fs::read_link(path)` to get the target.

## Resolution

Updated `list_dir` to call `std::fs::read_link()` on symlinks and display the target path: `name -> /target/path`. Falls back to `?` if the target can't be resolved.

