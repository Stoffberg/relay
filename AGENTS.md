# Relay

Real time AI chat application. Web frontend on Cloudflare Pages, Rust server on Fly.io calling LLMs via OpenRouter, SpacetimeDB for all state and sync, and a local Rust agent on the user's machine for tool execution (file ops, shell commands, etc).

ALL state lives in SpacetimeDB. The frontend is purely reactive, deriving everything from DB subscriptions. No in memory queues on the server for application state.

## Architecture

```
User's Browser ──ws──> SpacetimeDB (maincloud)
                              ↑
User's Browser ──http──> Fly.io Server ──ws──> SpacetimeDB
                              ↓
                         OpenRouter (LLM)
                              ↑
User's Machine ──ws──> SpacetimeDB <──> Local Agent (tools)
```

The server receives chat messages via HTTP, stores them in SpacetimeDB as `"queued"`, then processes them sequentially per session. The agent watches SpacetimeDB for tool_command rows and executes them locally. The frontend subscribes to SpacetimeDB and renders reactively.

## Monorepo Structure

```
relay/
├── apps/
│   ├── server/          # Rust, runs on Fly.io, calls OpenRouter
│   │   ├── src/main.rs  # Single file: HTTP handler, agent loop, streaming, tool dispatch
│   │   ├── src/module_bindings/  # Generated SpacetimeDB bindings (Rust)
│   │   ├── Dockerfile
│   │   ├── Fly.toml
│   │   └── Cargo.toml
│   ├── agent/           # Rust, runs on user's machine, executes tools
│   │   ├── src/main.rs  # CLI: setup/config/start/stop/status/logs/run
│   │   ├── src/tools/   # file_read, file_write, file_edit, shell_exec, glob, grep, list_dir
│   │   └── src/module_bindings/  # Generated SpacetimeDB bindings (Rust)
│   └── web/             # React + TanStack Start, deployed to Cloudflare Workers
│       └── src/
│           ├── routes/
│           │   ├── __root.tsx        # Layout, sidebar data, SpacetimeDB connection
│           │   ├── index.tsx         # Landing / redirect
│           │   └── chat.$sessionId.tsx  # Main chat page
│           ├── components/
│           │   ├── input-bar.tsx
│           │   ├── message-row.tsx   # Message rendering, tool call pills
│           │   ├── sidebar.tsx
│           │   ├── markdown-content.tsx
│           │   └── command-palette.tsx
│           ├── lib/
│           │   ├── chat-store.ts     # ChatSessionStore: all message state management
│           │   ├── design-data.ts
│           │   ├── design-logic.ts
│           │   └── design-theme.ts
│           ├── spacetime.ts          # SpacetimeDB connection, event system, cache helpers
│           └── module_bindings/      # Generated SpacetimeDB bindings (TypeScript)
├── packages/
│   ├── spacetime/       # SpacetimeDB module (Rust, compiled to WASM)
│   │   └── src/lib.rs   # Schema: 6 tables, 14 reducers
│   ├── infra/           # Cloudflare deployment via Alchemy
│   │   └── alchemy.run.ts
│   ├── shared/
│   └── config/
├── Cargo.toml           # Workspace: apps/server, apps/agent, packages/spacetime
├── package.json         # Bun workspaces: apps/*, packages/*
└── turbo.json
```

## Package Manager and Tooling

Package manager is **bun**. Binary at `~/.bun/bin/bun`. Always use bun for JS dependencies, never npm or yarn. Never edit package.json directly; use `bun add` / `bun remove`.

SpacetimeDB CLI is at `~/.local/bin/spacetime`. Both SpacetimeDB and Cargo need `$HOME/.cargo/bin` in PATH for WASM builds.

Formatting and linting use **Biome** (`biome.json` at root). Runs automatically on file save.

## SpacetimeDB Schema

Six tables defined in `packages/spacetime/src/lib.rs`:

| Table | Primary Key | Key Fields |
|-------|------------|------------|
| session | id (String) | user_id, title, status, created_at, updated_at |
| message | id (String) | session_id, role, status, created_at |
| message_part | id (u64, auto_inc) | message_id, part_index, content |
| tool_command | id (u64, auto_inc) | message_id, session_id, agent_id, tool_name, tool_args, status |
| tool_result | id (u64, auto_inc) | tool_command_id, success, output, error |
| agent | id (String) | name, user_id, status, last_heartbeat |

Valid message statuses: `"queued"`, `"streaming"`, `"complete"`, `"error"`
Valid session statuses: `"idle"`, `"streaming"`, `"waiting_for_tool"`, `"error"`
Valid tool_command statuses: `"pending"`, `"executing"`, `"completed"`, `"error"`

14 reducers: create_session, update_session_status, update_session_title, send_message, complete_message, fail_message, append_message_part, create_tool_command, update_tool_command_status, create_tool_result, register_agent, agent_heartbeat, agent_disconnect, init.

## Message Queuing Flow

1. User sends message via HTTP POST to `/chat`
2. Server calls `send_message` reducer with status `"queued"`
3. Server checks `active_sessions` HashSet; if no loop running for this session, spawns `run_session_queue`
4. `run_session_queue` polls for oldest queued message, marks it `"complete"` via `complete_message` reducer, then runs `run_agent_loop` with that message's content
5. `fetch_history` only returns messages with `status == "complete"`, so queued messages are invisible to the LLM
6. After agent loop finishes, loop back to step 4 for next queued message
7. When no more queued messages, set session status to `"idle"` and remove from `active_sessions`

This gives proper conversation isolation: each message is processed with the full history of all previous completed messages, but not future queued ones.

## Server (apps/server/)

Single binary Rust application. One file: `src/main.rs` (~1030 lines).

Key components:
- `chat_handler`: HTTP POST `/chat`, accepts `{ message, session_id, user_message_id? }`, stores queued message, spawns queue processor if needed
- `run_session_queue`: Loop that processes queued messages one at a time per session
- `run_agent_loop`: Builds conversation from history, calls OpenRouter streaming API, handles tool calls in a loop (max 20 iterations)
- `stream_llm_response`: SSE streaming from OpenRouter, writes message_parts to SpacetimeDB in real time
- `dispatch_tool_call`: Creates tool_command in SpacetimeDB, waits for agent to write tool_result (polls with 120s timeout)
- `fetch_history`: Builds LLM conversation from SpacetimeDB cache (only complete messages)

System prompt changes based on whether an agent is online (`has_online_agent`). When no agent: tools are NOT sent to the LLM, and the prompt says it can't access the user's machine. When agent is online: tools are sent, prompt is balanced (use tools only when the user asks for machine interaction).

Environment variables on Fly.io:
- `OPENROUTER_API_KEY` (required)
- `OPENROUTER_MODEL` (defaults to `anthropic/claude-3.5-sonnet`)
- `SPACETIME_HOST` (defaults to `https://maincloud.spacetimedb.com`)
- `SPACETIME_DB` (defaults to `relay`)

## Agent (apps/agent/)

CLI binary installed at `/usr/local/bin/relay`. Subcommands: setup, config, start, stop, status, logs, run.

7 tools: file_read, file_write, file_edit, shell_exec, glob, grep, list_dir. Each in its own file under `src/tools/`.

The agent connects to SpacetimeDB, registers itself, and watches for `tool_command` rows assigned to it. When one appears, it executes the tool locally and writes the result back.

shell_exec note: successful commands output raw stdout (no "stderr:" prefix). Many CLI tools write to stderr normally; prefixing it was causing the LLM to think tools failed.

## Frontend (apps/web/)

React + TanStack Start + TanStack Router. Deployed to Cloudflare Workers via Alchemy.

Key patterns:
- **All state comes from SpacetimeDB subscriptions.** No REST calls to the server for reading data. The only HTTP call is POST `/chat` to send messages.
- **ChatSessionStore** (`lib/chat-store.ts`): Core state management class. Manages messages, tool calls, status, optimistic updates. Uses `useSyncExternalStore` for React integration.
- **Optimistic messages**: When user sends a message, it's added locally with status `"optimistic"` immediately. When the SpacetimeDB subscription confirms, status updates to `"queued"` then `"complete"`.
- **Virtualizer**: Messages use `@tanstack/react-virtual` for efficient rendering.
- **SpacetimeDB timestamps**: Objects with `__timestamp_micros_since_unix_epoch__` (bigint), NOT plain numbers. Extract via `Number(ts.__timestamp_micros_since_unix_epoch__ / 1000n)`. There's an `extractTimestamp()` helper for this.
- **Sidebar**: Sessions sorted by `updatedAt` desc. Numbering reversed (01 at bottom). Latest conversations appear at top.
- **Chat area max width**: 1060px.
- **Input stays enabled while busy**: Users can send messages anytime (they queue up).

CSS: Tailwind CSS v4 with `@theme inline` for color tokens (shadcn style custom properties). See `styles.css`.

Tool call pills in message-row.tsx show the tool name and a summary arg, expand to show OUTPUT (not arguments).

## Deployment

### Deploy everything
```bash
bun run deploy
```

### SpacetimeDB schema only
```bash
PATH="$HOME/.cargo/bin:$PATH" ~/.local/bin/spacetime publish relay --yes --delete-data --module-path packages/spacetime
```
WARNING: `--delete-data` wipes all data. Only use when schema changes are incompatible.

### Regenerate bindings after schema change
```bash
# TypeScript (for web)
PATH="$HOME/.cargo/bin:$PATH" ~/.local/bin/spacetime generate --lang=typescript --out-dir=apps/web/src/module_bindings --module-path=packages/spacetime

# Rust (for server)
PATH="$HOME/.cargo/bin:$PATH" ~/.local/bin/spacetime generate --lang=rust --out-dir=apps/server/src/module_bindings --module-path=packages/spacetime

# Rust (for agent)
PATH="$HOME/.cargo/bin:$PATH" ~/.local/bin/spacetime generate --lang=rust --out-dir=apps/agent/src/module_bindings --module-path=packages/spacetime
```

### Server (Fly.io)
```bash
FLY_NO_UPDATE_CHECK=1 FLYCTL_NO_TELEMETRY=1 fly deploy --remote-only --depot=false --config Fly.toml --dockerfile Dockerfile
```
Run from `apps/server/` directory. Always use `--depot=false` (depot builder hangs). Always use `--remote-only`.

Fly app: `server-silent-darkness-2099`, region: `fra`
Custom domain: `code-api.stoff.dev`

### Web (Cloudflare Workers)
```bash
cd packages/infra && PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run alchemy.run.ts
```
Or: `bun run deploy:web` from root.

Custom domain: `code.stoff.dev`
Worker URL: `relay-relay-web-production.plutocrat.workers.dev`

### Agent binary (local install from source)
```bash
cargo build --release -p relay-agent
cp target/release/relay-agent /usr/local/bin/relay
```

## Testing the Chat API

Send a message:
```bash
SESSION_ID="test-$(date +%s)"
curl -s -X POST https://code-api.stoff.dev/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"Hello\", \"session_id\": \"$SESSION_ID\"}"
```

Check messages in SpacetimeDB:
```bash
PATH="$HOME/.cargo/bin:$PATH" ~/.local/bin/spacetime sql relay \
  "SELECT id, role, status FROM message WHERE session_id = '$SESSION_ID'"
```

Check message content:
```bash
PATH="$HOME/.cargo/bin:$PATH" ~/.local/bin/spacetime sql relay \
  "SELECT content FROM message_part WHERE message_id = '<msg_id>'"
```

Check session status:
```bash
PATH="$HOME/.cargo/bin:$PATH" ~/.local/bin/spacetime sql relay \
  "SELECT id, status FROM session WHERE id = '$SESSION_ID'"
```

Note: SpacetimeDB SQL is limited. No `ORDER BY`, no `GROUP BY`, no `COUNT`. Simple `SELECT ... WHERE` only.

Burst test (10 concurrent messages):
```bash
SESSION_ID="burst-$(date +%s)"
for i in $(seq 1 10); do
  curl -s -X POST https://code-api.stoff.dev/chat \
    -H "Content-Type: application/json" \
    -d "{\"message\": \"Reply with exactly: MSG_$i\", \"session_id\": \"$SESSION_ID\"}" &
done
wait
# Wait 60s for processing, then check:
spacetime sql relay "SELECT id, role, status FROM message WHERE session_id = '$SESSION_ID'"
# Should show 10 user + 10 assistant messages, all "complete"
```

## GitHub

Repo: `Stoffberg/relay` (public)
Push via the Personal/Stoffberg GitHub account.

## Known Issues and Gotchas

1. **SpacetimeDB subscription cache race**: After calling a reducer, the subscription update may take >300ms to arrive (Fly.io to maincloud). Must poll with retries, not fixed delays.

2. **Fly.io autostop**: If the server is waiting for tool results and Fly autostops the machine, the session gets stuck. Server recovers stale sessions on startup (including idle sessions with queued messages).

3. **Tool output truncation**: Both `fetch_history` and `dispatch_tool_call` cap output at 30000 chars.

4. **SpacetimeDB SQL limitations**: No ORDER BY, GROUP BY, COUNT, JOINs. Only basic SELECT/WHERE. For complex queries, pull data through the SDK.

5. **Binding regeneration**: After schema changes, regenerate bindings for all three targets (web TypeScript, server Rust, agent Rust). The generated code goes into `module_bindings/` directories.

6. **The Dockerfile context**: The server Dockerfile copies from `.` which is `apps/server/`. It builds a standalone binary since the server Cargo.toml is self-contained (not a workspace build). This works because `fly deploy` is run from `apps/server/`.

## Cargo Check

Always verify server compiles before deploying:
```bash
cargo check -p relay-server
```

Frontend build check:
```bash
cd apps/web && bun run build
```
