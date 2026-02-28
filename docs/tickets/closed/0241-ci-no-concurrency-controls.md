# CI Has No Concurrency Controls for Stale Runs

**Type:** task
**Severity:** low
**Component:** infra
**Reported:** 2026-02-27

## Description

The CI workflow has no `concurrency` configuration. Multiple pushes to `main` in quick succession will run all jobs in parallel without cancelling stale runs. This wastes CI minutes and can cause confusing status checks when an older run completes after a newer one.

## Expected Behavior

Add concurrency controls to cancel in-progress runs when a new push arrives:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

## Implementation Notes

Add the `concurrency` block at the top level of the workflow, right after `on:`.

## Resolution

Added a `concurrency` block to `ci.yml` with `group: ci-${{ github.ref }}` and `cancel-in-progress: true`. Stale CI runs on the same branch are now cancelled when a new push arrives.
