# Grep Tool Off-by-One in Match Limit

**Type:** bug
**Severity:** low
**Component:** agent
**Reported:** 2026-02-27

## Description

In `grep.rs`, the match limit check uses `results.len() > MAX_MATCHES` (greater than) instead of `>=`. Since `MAX_MATCHES` is 500, this allows 501 results before truncating. Minor off-by-one error.

## Expected Behavior

Stop at exactly 500 matches. Use `results.len() >= MAX_MATCHES`.

## Implementation Notes

Change `>` to `>=` in the match limit check.

## Resolution

Changed the match limit check in `grep.rs` from `>` to `>=` so it stops at exactly 500 matches instead of 501. Built and installed the agent binary.
