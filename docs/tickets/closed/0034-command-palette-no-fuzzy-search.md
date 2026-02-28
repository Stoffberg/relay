# Command Palette Uses Substring Match Instead of Fuzzy Search

**Type:** task
**Severity:** low
**Component:** web
**Reported:** 2026-02-26

## Description

In `apps/web/src/components/command-palette.tsx`, session search uses a simple case-insensitive `.includes()` substring match. This means:
1. Searching "py script" won't match a session titled "Python scripting help"
2. Searching "auth bug" won't match "Fix authentication bug in login"
3. Typos like "markdwn" won't match "Markdown rendering"

Also, results are limited to 8 when the query is empty (hardcoded), and there's no relevance ranking.

## Expected Behavior

Implement basic fuzzy matching that:
1. Matches non-contiguous characters (like VS Code's Cmd+P)
2. Ranks results by match quality (exact > prefix > fuzzy)
3. Highlights matching characters in results
4. Shows all results when filtering (remove the hardcoded 8 limit, or paginate)

## Implementation Notes

Options (lightest to heaviest):
1. **Simple word-based matching**: Split query into words, check if each word appears somewhere in the title. Covers "py script" matching "Python scripting".
2. **fzf-style fuzzy**: Use a library like `fuse.js` (2KB gzipped) for proper fuzzy matching with scoring.
3. **Custom**: Implement a basic subsequence match with scoring.

Option 1 is probably sufficient for a command palette. Add it to `command-palette.tsx` in the filter logic.

## Resolution

Replaced the simple `.includes()` substring match with a multi-strategy scoring system: exact substring match (+10), prefix match (+5), word-level matches (+2 each), and character subsequence matching (+1 per char) as a fallback. Results are sorted by score. Empty query still shows the 8 most recent sessions. No external dependencies added. Deployed to Cloudflare Workers.
