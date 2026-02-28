# Add Per-Session Model Selection

**Type:** feature
**Severity:** medium
**Component:** server, web
**Reported:** 2026-02-26

## Description

The LLM model is globally configured via the `OPENROUTER_MODEL` env var (defaults to `anthropic/claude-3.5-sonnet`). There's no way to select a different model per session or per message.

This limits flexibility. Users might want:
1. A faster, cheaper model for quick questions (e.g., `anthropic/claude-3-haiku`)
2. A more capable model for complex coding tasks (e.g., `anthropic/claude-3.5-opus`)
3. To experiment with different models on different conversations

## Expected Behavior

1. The `session` table gets a `model` field (nullable string, defaults to the global default)
2. The frontend shows a model selector in the chat header or input bar
3. The `/chat` endpoint optionally accepts a `model` field
4. `run_agent_loop` uses the session's model if set, falling back to the global default

## Implementation Notes

### Schema (`packages/spacetime/src/lib.rs`)
Add `model: Option<String>` to the `Session` table and an `update_session_model` reducer.

### Server (`apps/server/src/main.rs`)
In `run_agent_loop`, read the session's model from SpacetimeDB. If set, use it; otherwise fall back to `state.openrouter_model`.

### Frontend (`apps/web/`)
Add a model dropdown in the chat header. Populate it with a hardcoded list of supported models (or fetch from OpenRouter's model list API). When changed, call the `update_session_model` reducer.

### Bonus
Show the model name in the sidebar next to each session so users can see which model each conversation uses.

## Resolution

Added `model: Option<String>` to Session table and `update_session_model` reducer. Server's `agent_loop.rs` reads the session model from SpacetimeDB and passes it as `model_override` to `stream_llm_response`. Frontend has a `ModelSelector` dropdown in the chat header showing 6 models (Claude Sonnet 4, Claude 3.5 Sonnet, Gemini 2.5 Pro, Gemini 2.5 Flash, GPT 4.1, o3). Selected model appears in the sidebar below session title. Setting default clears the override so the server env var is used.
