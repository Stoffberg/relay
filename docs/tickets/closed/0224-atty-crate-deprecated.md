# Agent Uses Deprecated atty Crate

**Type:** task
**Severity:** low
**Component:** agent
**Reported:** 2026-02-27

## Description

The agent depends on the `atty` crate for terminal detection (`atty::is(atty::Stream::Stdout)`). This crate is unmaintained and has a known soundness issue. The standard library now provides `std::io::IsTerminal` (stable since Rust 1.70), which is the recommended replacement.

## Expected Behavior

Replace `atty::is(atty::Stream::Stdout)` with `std::io::stdout().is_terminal()` and remove the `atty` dependency from `Cargo.toml`.

## Implementation Notes

1. Replace `atty::is(atty::Stream::Stdout)` with `use std::io::IsTerminal; std::io::stdout().is_terminal()`
2. Remove `atty` from `apps/agent/Cargo.toml`

## Resolution

Replaced `atty::is(atty::Stream::Stdout)` with `std::io::IsTerminal::is_terminal(&std::io::stdout())` and removed the `atty` dependency from `Cargo.toml`. Uses the standard library's built-in terminal detection available since Rust 1.70.
