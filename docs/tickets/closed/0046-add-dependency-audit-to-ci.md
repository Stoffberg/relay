# Add Dependency Audit to CI Pipeline

**Type:** task
**Severity:** medium
**Component:** infra
**Reported:** 2026-02-27

## Description

The CI pipeline has no security scanning. Neither Rust dependencies (`cargo audit`) nor JavaScript dependencies (`bun audit` or similar) are checked for known vulnerabilities.

The project uses many third-party crates and npm packages. Without automated auditing, vulnerable dependencies could ship to production.

## Expected Behavior

Add a security audit job to CI that:
1. Runs `cargo audit` for Rust dependencies
2. Runs `bun pm audit` or equivalent for JS dependencies
3. Fails the build if high/critical vulnerabilities are found
4. Runs on a schedule (weekly) in addition to on push

## Implementation Notes

Add to `.github/workflows/ci.yml`:

```yaml
audit:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: dtolnay/rust-toolchain@stable
    - run: cargo install cargo-audit
    - run: cargo audit
    - uses: oven-sh/setup-bun@v1
    - run: bun install --frozen-lockfile
    - run: bun pm audit || true  # Warn but don't block for now
```

Start with `|| true` on the bun audit to avoid blocking on transitive dependency issues that can't be immediately fixed. Graduate to strict mode once the dependency tree is clean.

Also consider adding a weekly scheduled run:

```yaml
on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday at 9am
```

## Resolution

Added `audit` job to CI pipeline that runs `cargo audit` (strict) and `bun pm audit` (warn only) in parallel with lint/clippy. Added weekly schedule trigger (Monday 9am UTC) alongside push/PR triggers.
