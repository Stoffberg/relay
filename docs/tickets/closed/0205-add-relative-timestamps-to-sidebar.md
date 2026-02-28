# Add Relative Timestamps to Sidebar Sessions

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The sidebar shows session titles and message counts but no time context. Users can't tell when they last used a conversation. There's no "5 minutes ago", "Yesterday", or date grouping.

## Expected Behavior

Show a relative timestamp for each session: "just now", "2m", "1h", "Yesterday", "Feb 25". Update these periodically (every 60 seconds) so they stay accurate.

## Implementation Notes

The `updatedAt` field exists on sessions and is already extracted via `extractTimestamp()`. A small utility function that converts milliseconds to relative time strings is all that's needed. No external dependency required.

## Resolution

Added a `relativeTime()` helper in `sidebar.tsx` that formats timestamps as "just now", "2m", "1h", "Yesterday", or "Feb 25". The sidebar now shows relative time for each session instead of message count. A 60-second interval tick forces re-renders to keep timestamps fresh. Deployed to Cloudflare Workers.

