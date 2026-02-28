# shell_exec Strips Most Environment Variables

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

In `apps/agent/src/tools/shell_exec.rs`, the shell command is executed with an explicit, minimal set of environment variables (HOME, PATH, LANG). All other environment variables from the parent process are stripped.

This means tools that rely on environment variables will fail:
1. `git` operations that need `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, or SSH agent (`SSH_AUTH_SOCK`)
2. `npm`/`bun` that need `NODE_PATH` or registry tokens
3. `docker` that needs `DOCKER_HOST`
4. `aws` CLI that needs `AWS_ACCESS_KEY_ID`
5. Any tool configured via environment (which is most of them)

The PATH is also hardcoded with specific directories, missing any custom additions the user might have.

## Expected Behavior

Inherit the parent process's environment by default, with selective overrides:

```rust
let mut cmd = Command::new("sh");
cmd.arg("-c").arg(&args.command);
// Inherit parent environment (default behavior when .env_clear() is NOT called)
// Optionally override specific vars
cmd.env("LANG", "en_US.UTF-8");
```

By NOT calling `.env_clear()` (or equivalent), the child process inherits all parent environment variables.

## Implementation Notes

In `apps/agent/src/tools/shell_exec.rs`, the current code explicitly sets HOME, PATH, and LANG. Instead:

1. Remove explicit environment clearing
2. Let the child process inherit the parent's environment
3. Only override LANG if needed for consistent output
4. Remove the hardcoded PATH; let it inherit from the parent

This is a behavior change that makes the agent more useful but also potentially exposes more environment to the LLM. Document the trade-off in the tool description.

## Resolution

Removed the explicit HOME override so the child process inherits it from the parent. Changed PATH construction to prepend our extra dirs (bun, cargo, local, homebrew) to the existing PATH instead of replacing it. This means SSH_AUTH_SOCK, GIT_AUTHOR_NAME, DOCKER_HOST, and all other env vars are now inherited. Agent rebuilt and installed.
