# Server Dockerfile Has No .dockerignore

**Type:** task
**Severity:** low
**Component:** infra
**Reported:** 2026-02-27

## Description

The server's Dockerfile uses `COPY . .` to copy the build context, but there's no `.dockerignore` file in the `apps/server/` directory. Without one, Docker copies everything including `target/`, `.git/`, documentation, and other unnecessary files into the build context, slowing down the build.

Since Fly.io builds remotely (`--remote-only`), the entire build context is uploaded over the network, making this particularly impactful.

## Expected Behavior

Add a `.dockerignore` file to `apps/server/` that excludes build artifacts and unnecessary files.

## Implementation Notes

Create `apps/server/.dockerignore`:

```
target/
.git/
*.md
docs/
```

Note: since `fly deploy` runs from the `apps/server/` directory, the context is already scoped to that directory. But `target/` (if it exists locally) and other files still get included.

## Resolution

Created `apps/server/.dockerignore` excluding `target/`, `*.md`, and `docs/` from the Docker build context. Reduces upload size for remote builds on Fly.io. Deployed and verified the build still works correctly.
