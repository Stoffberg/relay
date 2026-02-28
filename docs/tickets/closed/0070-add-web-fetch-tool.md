# Add web_fetch Tool for URL Content Retrieval

**Type:** feature
**Severity:** medium
**Component:** agent, server
**Reported:** 2026-02-27

## Description

The agent has no tool for fetching web content. When a user asks the AI to check a URL, read documentation from the web, or fetch API responses, the AI has to either:
1. Say "I can't access the web" (unhelpful)
2. Ask the user to use `shell_exec` with `curl` (works but clunky and the LLM has to parse raw HTML)

A dedicated `web_fetch` tool that retrieves a URL and returns the content as clean text or markdown would be much more useful.

## Expected Behavior

New tool: `web_fetch`
1. Accepts a `url` parameter
2. Fetches the URL content via HTTP GET
3. Converts HTML to clean text or markdown (stripping scripts, styles, nav, etc.)
4. Returns the content (truncated to 30000 chars like other tools)

## Implementation Notes

### Agent
Add `apps/agent/src/tools/web_fetch.rs`:

```rust
pub fn execute(args: WebFetchArgs) -> Result<String> {
    let response = reqwest::blocking::get(&args.url)?;
    let html = response.text()?;
    let text = html2text::from_read(html.as_bytes(), 120); // or use readability-rs
    Ok(text)
}
```

Dependencies: `reqwest` (already in workspace), `html2text` or `readability` crate for content extraction.

### Server
Add the tool definition to `tool_definitions()`:

```json
{
  "name": "web_fetch",
  "description": "Fetch a URL and return its content as clean text. Strips HTML, scripts, and navigation. Returns up to 30000 characters.",
  "parameters": {
    "url": { "type": "string", "description": "The URL to fetch" }
  }
}
```

### Agent
Add the tool to the match statement in `execute_tool()`.

## Resolution

Added `web_fetch` tool to both agent and server. Agent implementation in `apps/agent/src/tools/web_fetch.rs` uses reqwest (async, rustls) to HTTP GET the URL, strips HTML tags/scripts/styles via regex, and truncates to 30000 chars. Tool definition added to server's `tool_definitions()` so the LLM can invoke it. Used regex based HTML stripping instead of an external crate to keep dependencies minimal.
