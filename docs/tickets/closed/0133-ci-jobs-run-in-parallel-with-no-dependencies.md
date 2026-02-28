# CI Jobs Run in Parallel With No Dependencies

**Type:** task
**Severity:** medium
**Component:** infra
**Reported:** 2026-02-27

## Description

In `.github/workflows/ci.yml`, all jobs (lint, typecheck, test, build) run independently with no `needs:` dependencies. This means:

1. If lint fails, build still runs (wastes CI minutes)
2. If typecheck fails, tests still run
3. Bun install runs 3+ times independently (no caching between jobs)
4. Rust toolchain is set up in multiple jobs redundantly

## Expected Behavior

Add job dependencies so fast checks gate slower ones:

```yaml
typecheck:
  needs: [lint]

test-rust:
  needs: [lint]

build:
  needs: [typecheck, test-rust]
```

Also add bun and cargo caching to avoid reinstalling dependencies in every job. The `oven-sh/setup-bun` action supports caching natively.

## Implementation Notes

The current CI runs ~4 separate bun installs and ~2 cargo builds per push. With proper caching and job ordering, this could be cut to 1 bun install and 1 cargo build, significantly reducing CI time and cost.

## Resolution

Added `needs:` dependencies to `ci.yml`: typecheck needs lint, test-rust needs clippy, and build needs both typecheck and test-rust. Fast checks now gate slower ones so failures short-circuit early and save CI minutes.

