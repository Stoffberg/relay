# Zero Test Coverage Across Entire Codebase

**Type:** task
**Severity:** high
**Component:** server, agent, web
**Reported:** 2026-02-27

## Description

The entire Relay codebase has zero tests. No unit tests, no integration tests, no e2e tests, no test utilities, no mocks. The CI pipeline runs `cargo test --all` which finds nothing and passes vacuously. The web project has `vitest` as a dependency but no test files exist.

This means:
1. Any refactor can silently break things
2. No regression protection
3. Edge cases are discovered in production
4. New contributors have no safety net

## Expected Behavior

Add tests incrementally, prioritizing the most critical and error-prone code paths:

### Priority 1: Agent tool tests (highest ROI, easiest to test)
Unit tests for each tool in `apps/agent/src/tools/`:
- `file_read`: Test reading files, directories, offset/limit, non-existent files, binary files
- `file_write`: Test creating files, overwriting, directory creation, permissions
- `file_edit`: Test single match, multiple matches, no match, empty file
- `shell_exec`: Test success, failure, exit codes, stderr, timeout (when added)
- `glob`: Test patterns, no matches, nested directories
- `grep`: Test regex, include filter, no matches, large files
- `list_dir`: Test normal dir, empty dir, permissions

### Priority 2: SpacetimeDB reducer tests
Test status transitions, validation logic, edge cases in `packages/spacetime/src/lib.rs`.

### Priority 3: Frontend component tests
Use vitest + testing-library for:
- `chat-store.ts`: State management logic, optimistic updates, merge behavior
- `message-row.tsx`: Rendering different message types and statuses
- `markdown-content.tsx`: Code blocks, tables, links
- `input-bar.tsx`: Submit behavior, keyboard shortcuts

### Priority 4: Server integration tests
Test the HTTP handler, streaming, and tool dispatch in `apps/server/`.

## Implementation Notes

For Rust tests, add `#[cfg(test)]` modules in each file. For the agent tools, create temp directories in tests:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_file_read_existing_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("test.txt");
        std::fs::write(&path, "hello\nworld").unwrap();
        let result = execute(FileReadArgs { path: path.to_str().unwrap().into(), offset: None, limit: None }).unwrap();
        assert!(result.contains("hello"));
    }
}
```

For the web, configure vitest in `apps/web/vitest.config.ts` and add tests alongside components.

## Resolution

Added 69 tests across the codebase, covering Priority 1 and Priority 3 from the ticket.

**Agent tool tests (52 tests):** Added `#[cfg(test)]` modules with `tempfile` for each tool: `file_read` (7 tests: existing file, offset/limit, nonexistent, directory, binary, empty, default limit), `file_write` (5 tests: new, overwrite, parent dir creation, oversized rejection, empty), `file_edit` (6 tests: single match, no match, multiple without flag, replace all, multiline, nonexistent), `shell_exec` (8 tests: simple command, exit code, stderr, no output, workdir, multiline, truncation within/over limit), `glob` (5 tests: matches, no matches, nested, traversal rejection, sorting), `grep` (8 tests: single file, no matches, regex, recursive, include filter, hidden dirs, long pattern, nonexistent), `list_dir` (6 tests: files/subdirs, sizes, case insensitive sort, nonexistent, on file, empty + 3 format_size tests), `validate_path` (4 tests: traversal, outside home, home subpath, nonexistent under home).

**Frontend tests (17 tests):** Created `vitest.config.ts` and `chat-store.test.ts`. `buildChatMessages`: 7 tests covering empty, sessionId filtering, timestamp sorting, multi-part assembly, tool call attachment with results, optimistic messages, deduplication. `computeStatus`: 9 tests covering idle, streaming, waiting_for_tool, optimistic busy, showThinking states, assistant/empty messages, error propagation.

Priority 2 (SpacetimeDB reducer tests) deferred because reducers run in WASM and require the SpacetimeDB test harness. Priority 4 (server integration tests) deferred because it needs mock infrastructure for SpacetimeDB client and OpenRouter API.
