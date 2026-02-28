# Relay: Ticket Tracker

Local ticket tracking for bugs, features, and tasks. Each ticket is a markdown file that lives in one of the state folders.

## States

| Folder | Meaning |
|--------|---------|
| `open/` | New, not yet started |
| `in-progress/` | Actively being worked on |
| `resolved/` | Fix or implementation complete, needs verification |
| `closed/` | Verified and done |

Move the file between folders to update its state.

## Naming

`NNNN-short-description.md` where `NNNN` is the next available number, zero padded.

Examples: `0001-agent-crashes-on-empty-message.md`, `0002-add-session-search.md`

## Ticket Template

```markdown
# Title

**Type:** bug | feature | task
**Severity:** critical | high | medium | low
**Component:** server | agent | web | infra
**Reported:** YYYY-MM-DD

## Description

What's happening or what's needed.

## Steps to Reproduce (bugs)

1. ...
2. ...

## Expected Behavior

What should happen.

## Resolution

How it was fixed (fill in when resolving). Commit, PR, or short explanation.
```

## Components

- `server`: SpacetimeDB server module
- `agent`: Rust agent process
- `web`: Frontend application
- `infra`: Deployment, CI, networking
