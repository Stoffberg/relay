# Dockerfile Runs as Root

**Type:** bug
**Severity:** high
**Component:** infra
**Reported:** 2026-02-27

## Description

The server Dockerfile (`apps/server/Dockerfile`) has no `USER` directive in the runtime stage. The binary runs as root inside the container. If there's ever a remote code execution vulnerability in the server (or in a dependency), an attacker has full root access to the container.

## Expected Behavior

Create a non-root user and switch to it before the ENTRYPOINT:

```dockerfile
RUN groupadd -r relay && useradd -r -g relay relay
USER relay:relay
ENTRYPOINT ["/usr/local/bin/relay-server"]
```

## Implementation Notes

In `apps/server/Dockerfile`, add the user creation in the runtime stage (after `apt-get install` but before `COPY --from=builder`):

```dockerfile
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
RUN groupadd -r relay && useradd -r -g relay -d /nonexistent -s /usr/sbin/nologin relay
COPY --from=builder /usr/local/bin/relay-server /usr/local/bin/relay-server
USER relay
ENTRYPOINT ["/usr/local/bin/relay-server"]
```

The `/nonexistent` home directory and `/usr/sbin/nologin` shell prevent the user from having a real shell or home directory, reducing attack surface.

Verify the binary doesn't need write access to any directory (it shouldn't since all state is in SpacetimeDB). If it does write logs or temp files, create a writable directory owned by the relay user.

## Resolution

Added non-root user to Dockerfile runtime stage. Creates 'relay' group and user with no home directory and nologin shell, then switches to that user via USER directive before ENTRYPOINT. The binary doesn't need write access to any directory since all state is in SpacetimeDB.
