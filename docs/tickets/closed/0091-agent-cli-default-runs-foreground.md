# Agent CLI Running With No Subcommand Starts Foreground Agent

**Type:** bug
**Severity:** medium
**Component:** agent
**Reported:** 2026-02-27

## Description

Running `relay` with no subcommand quietly tries to start the agent in foreground mode. If config exists, it connects to SpacetimeDB and blocks. If no config, it prints a message to stderr and exits with success (exit code 0).

This is unexpected behavior. Users who type `relay` expecting help or a usage summary instead get a blocking foreground process or a silent exit. Most CLI tools show help when invoked without arguments.

## Expected Behavior

Running `relay` with no subcommand should display the help text (same as `relay --help`). The foreground run behavior should require explicit `relay run`.

## Implementation Notes

In `apps/agent/src/main.rs`, change the default behavior when no subcommand is provided:

```rust
match cli.command {
    Some(Commands::Run) => { /* existing run logic */ },
    Some(cmd) => { /* existing subcommand handling */ },
    None => {
        Cli::command().print_help()?;
        std::process::exit(0);
    }
}
```

Or use clap's `SubcommandRequired` attribute:
```rust
#[command(subcommand_required = true)]
```

This also means `relay run` is now the explicit way to run in foreground, which is more intentional and discoverable.

## Resolution

Changed the None arm in the CLI match to call Cli::command().print_help() and return, instead of falling through to the foreground run behavior. Running relay with no subcommand now shows help text. Added CommandFactory to clap imports. Agent rebuilt and installed.
