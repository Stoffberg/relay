# Add Cargo Clippy Linting to CI

**Type:** task
**Severity:** medium
**Component:** infra
**Reported:** 2026-02-27

## Description

The CI pipeline (`.github/workflows/ci.yml`) runs `cargo test --all` but doesn't run `cargo clippy`. Clippy catches common Rust mistakes, performance issues, and style problems that the compiler doesn't flag.

Examples of things clippy catches:
1. Unnecessary allocations (`.to_string()` when `&str` suffices)
2. Redundant clones
3. Missing error handling patterns
4. Potentially slow patterns
5. Deprecated API usage

## Expected Behavior

Add a clippy step to the CI workflow that runs alongside the existing lint and test jobs.

## Implementation Notes

In `.github/workflows/ci.yml`, add a new job or add to the existing `test-rust` job:

```yaml
clippy:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: dtolnay/rust-toolchain@stable
      with:
        components: clippy
    - uses: Swatinem/rust-cache@v2
    - run: cargo clippy --all -- -D warnings
```

The `-D warnings` flag treats clippy warnings as errors, preventing PRs from merging with lint issues.

If there are existing clippy warnings in the codebase, first run `cargo clippy --all` locally to fix them, then enable the CI check.

## Resolution

Added a `clippy` job to `ci.yml` that runs `cargo clippy --all -- -D warnings` with the clippy component installed via `dtolnay/rust-toolchain@stable`. The job runs in parallel with lint, and test-rust depends on it passing first.
