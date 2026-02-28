# Agent Has No Log Level Control

**Type:** feature
**Severity:** low
**Component:** agent
**Reported:** 2026-02-27

## Description

The agent uses tracing for logging but provides no way to control the log level. It always logs at the default level (info and above). When debugging issues, users need to see debug or trace level logs but can't.

Similarly, in production, users might want only warn/error level to reduce log noise.

## Expected Behavior

Add a `--log-level` flag (or `RELAY_LOG` env var) that accepts: trace, debug, info, warn, error.

```bash
relay run --log-level debug
```

Or via environment variable:
```bash
RELAY_LOG=debug relay run
```

## Implementation Notes

In `apps/agent/src/main.rs`, add a `--log-level` global option to the CLI:

```rust
#[derive(Parser)]
struct Cli {
    #[arg(long, default_value = "info", global = true)]
    log_level: String,
    // ...
}
```

Then use it when initializing the tracing subscriber:

```rust
let filter = EnvFilter::try_from_default_env()
    .unwrap_or_else(|_| EnvFilter::new(&cli.log_level));

tracing_subscriber::fmt()
    .with_env_filter(filter)
    .init();
```

This also enables `RUST_LOG=debug relay run` as a standard Rust convention.

## Resolution

Added `tracing-subscriber` `env-filter` feature and configured the subscriber to check `RELAY_LOG` env var first, then `RUST_LOG`, with a fallback to `info`. Users can now control log level via `RELAY_LOG=debug relay run` or the standard `RUST_LOG` mechanism. Supports all tracing filter syntax (per-module filters, etc.).
