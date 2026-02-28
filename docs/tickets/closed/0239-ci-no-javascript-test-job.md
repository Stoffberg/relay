# CI Pipeline Does Not Run JavaScript Tests

**Type:** bug
**Severity:** high
**Component:** infra
**Reported:** 2026-02-27

## Description

The CI pipeline (`.github/workflows/ci.yml`) has a `test-rust` job that runs `cargo test --all`, but there's no job running JavaScript/TypeScript tests. The web app has `vitest` configured with a `"test": "vitest run"` script in its `package.json`, but CI never executes it.

Any frontend test failures would go undetected in CI.

## Expected Behavior

Add a `test-js` job (or rename the existing `test-rust` to be more specific) that runs `bun run test` to execute the vitest suite.

## Implementation Notes

Add a new job to `ci.yml`:

```yaml
test-js:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v1
    - run: bun install
    - run: bun run test
```

## Resolution

Added `test-js` job to CI pipeline that runs after lint, using bun 1.3.9 with `bun run test`. Updated `build` job to depend on `[typecheck, test-rust, test-js]`.
