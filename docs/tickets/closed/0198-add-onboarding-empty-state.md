# Add Onboarding Experience and Better Empty State

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

New users see no explanation of what Relay is or what it can do. The landing page (`/`) immediately redirects to a random UUID session with three generic hardcoded suggestions ("What languages do you know?", "Write a fizzbuzz in Rust", "Explain async/await"). These don't explain the tool execution capability or the agent system.

When no agent is connected, there's no guidance on how to set one up. The user might not even know the agent exists.

## Expected Behavior

1. The empty state should adapt based on agent status:
   - **Agent online:** Show suggestions that highlight the agent capability ("Read my project's README", "Search my codebase for TODO comments", "Run my test suite")
   - **No agent:** Show a brief explanation of the agent and how to install it, alongside standard chat suggestions

2. First-time experience: show a brief welcome with Relay's key features (AI chat + local agent for file ops and shell commands)

3. Suggestion chips should auto-send on click, not just fill the input

## Resolution

Made empty state agent-aware. When agent is connected, shows codebase-oriented suggestions ("Read my project's README", "Search my codebase for TODO comments", "Run my test suite") and a message explaining agent capabilities. When no agent, shows general chat suggestions with a note about connecting an agent for file/shell access.

