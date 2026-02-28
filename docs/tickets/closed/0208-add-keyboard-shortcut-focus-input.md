# Add Keyboard Shortcut to Focus Input Textarea

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

There's no keyboard shortcut to quickly focus the chat input. The user has to click the textarea or tab through multiple elements to reach it. In a keyboard-driven workflow, this is a common friction point.

## Expected Behavior

Add a keyboard shortcut (e.g., `Escape` to focus input, or `/` when not already in an input field) that moves focus to the textarea. ChatGPT uses this pattern: pressing Escape while reading messages focuses the input.

## Resolution

Added a `data-chat-input` attribute to the textarea in `input-bar.tsx`. In `chat.$sessionId.tsx`, a global keydown listener catches `/` (when not already in a text field or input) and focuses the chat input. Deployed to Cloudflare Workers.

