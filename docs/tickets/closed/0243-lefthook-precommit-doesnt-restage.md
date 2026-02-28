# Lefthook Pre-Commit Applies Fixes But Doesn't Re-Stage Files

**Type:** bug
**Severity:** medium
**Component:** infra
**Reported:** 2026-02-27

## Description

The `lefthook.yml` pre-commit hook runs `biome check --apply` on staged files. When Biome auto-fixes a file (formatting, import sorting, lint fixes), the fix is written to the working tree but the staged snapshot still contains the pre-fix version. The commit captures the unfixed code, and the fix sits as an unstaged change.

This means commits can contain code that doesn't pass Biome checks, defeating the purpose of the pre-commit hook.

## Expected Behavior

After Biome applies fixes, the modified files should be re-staged so the commit contains the fixed version.

## Implementation Notes

Option 1: Change the Biome command to `--write` mode and add `stage_fixed: true` to the lefthook config (if supported by lefthook).

Option 2: Use `--check` instead of `--apply` (no auto-fix, just fail the commit). The developer fixes manually and re-commits. This is the simpler and safer approach.

Option 3: Chain commands: `biome check --apply {staged_files} && git add {staged_files}`.

## Resolution

Added `stage_fixed: true` to the biome pre-commit command in `lefthook.yml`. After Biome auto-fixes files, lefthook now re-stages them so the commit captures the fixed version. Also removed the `pass_filename: true` option since `{staged_files}` already handles filename passing.
