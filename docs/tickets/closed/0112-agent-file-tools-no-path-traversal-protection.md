# Agent File Tools Have No Path Traversal Protection

**Type:** bug
**Severity:** critical
**Component:** agent
**Reported:** 2026-02-27

## Description

All file-based agent tools (`file_read`, `file_write`, `file_edit`, `list_dir`) accept a `path` parameter that is used directly with `Path::new()` without any validation. The LLM (or a prompt injection attack) can read, write, or edit any file on the user's machine, including system files, SSH keys, and credentials.

Affected files:
- `apps/agent/src/tools/file_read.rs` line 6: `let path = Path::new(&args.path);`
- `apps/agent/src/tools/file_write.rs` line 5: direct path usage
- `apps/agent/src/tools/file_edit.rs` line 4: direct path usage
- `apps/agent/src/tools/list_dir.rs` line 5: direct path usage

## Steps to Reproduce

1. In a chat session with the agent online, ask: "Read the file /etc/passwd"
2. The agent will read and return the contents without any restriction

## Expected Behavior

The agent should enforce a working directory boundary. All paths should be canonicalized and verified to be within the configured workspace root before any operation. Paths like `../../etc/passwd` or absolute paths outside the workspace should be rejected with a clear error.

## Implementation Notes

Add a shared `validate_path` function in the tools module that:
1. Canonicalizes the requested path (resolves `..`, symlinks)
2. Checks it starts with the configured workspace root
3. Returns an error if outside bounds

The workspace root could come from the agent's config (set during `relay setup`) or default to the current working directory.

## Resolution

Added a shared `validate_path` function in the tools module that canonicalizes the requested path and verifies it's within the user's home directory. Called at the start of `file_read`, `file_write`, `file_edit`, `list_dir`, and `grep` before any filesystem operations. Absolute paths and `..` traversals outside $HOME are rejected with a clear error.

