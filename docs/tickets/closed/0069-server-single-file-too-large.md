# Server main.rs Is a Single 1100+ Line File

**Type:** task
**Severity:** medium
**Component:** server
**Reported:** 2026-02-27

## Description

The entire server is a single file (`apps/server/src/main.rs`) with 1100+ lines containing the HTTP handler, agent loop, streaming, tool dispatch, history building, tool definitions, rate limiting, auth, and all types.

This makes the code difficult to:
1. Navigate and understand
2. Review in PRs (every change touches the same file)
3. Test in isolation (everything is coupled)
4. Extend with new features

## Expected Behavior

Split `main.rs` into logical modules:

```
apps/server/src/
├── main.rs           # Entry point, server setup, router
├── auth.rs           # API key validation middleware
├── chat.rs           # chat_handler, request/response types
├── agent_loop.rs     # run_session_queue, run_agent_loop
├── streaming.rs      # stream_llm_response, SSE parsing
├── tools.rs          # tool_definitions, dispatch_tool_call
├── history.rs        # fetch_history, conversation building
├── state.rs          # AppState, shared types
└── prompts.rs        # System prompts
```

## Implementation Notes

This is a pure refactor with no behavior changes. Each module should:
1. Have a clear single responsibility
2. Export only what's needed by other modules
3. Keep the same function signatures

Start by extracting the most independent pieces first:
1. `tool_definitions()` into `tools.rs`
2. `fetch_history()` into `history.rs`
3. System prompts into `prompts.rs`
4. Types and AppState into `state.rs`

Then extract the more coupled pieces:
5. `stream_llm_response()` into `streaming.rs`
6. `dispatch_tool_call()` into `tools.rs`
7. `run_agent_loop()` and `run_session_queue()` into `agent_loop.rs`

Run `cargo check -p relay-server` after each extraction to verify compilation.

## Resolution

Split the 1703 line main.rs into 7 focused modules:

- `state.rs`: AppState, QueuedMessage, all request/response types, LLM types, SSE types, LLMResult enum
- `tools.rs`: tool_definitions() and dispatch_tool_call()
- `prompts.rs`: System prompt constants and build_system_prompt() function
- `history.rs`: fetch_history() for building LLM conversation from SpacetimeDB
- `streaming.rs`: send_llm_request() with retry logic and stream_llm_response() with SSE parsing
- `agent_loop.rs`: run_session_queue(), run_agent_loop(), agent discovery (has_online_agent, find_online_agent)
- `main.rs`: Entry point, SpacetimeDB setup, router config, HTTP handlers (health, chat, stop, echo)

No behavior changes. Deployed to Fly.io, health check passing, chat endpoint accepting requests.
