# Add Floating "Scroll to Bottom" Button

**Type:** feature
**Severity:** high
**Component:** web
**Reported:** 2026-02-27

## Description

When a user scrolls up in a conversation to read earlier messages, there's no way to jump back to the latest content. The auto-scroll logic only engages when the user is within 120px of the bottom. Once scrolled up, they're stranded and have to manually scroll all the way down, especially painful in long conversations.

Every modern chat app (ChatGPT, Claude, Slack, iMessage) shows a floating "↓" button when the user is scrolled away from the bottom.

## Expected Behavior

Show a floating scroll-to-bottom button when `userNearBottomRef.current === false`. Clicking it calls `scrollToBottom(true)` (force scroll). The button should:

1. Appear with a subtle fade-in animation
2. Show a down arrow icon
3. Optionally show a count of new messages received while scrolled up
4. Disappear when the user reaches the bottom

## Implementation Notes

The `userNearBottomRef` and `scrollToBottom` already exist in `chat.$sessionId.tsx`. This is just a UI element that conditionally renders based on the ref's value. Use a state variable synced from the scroll handler to trigger visibility.

## Resolution

Added a `showScrollBtn` state driven by the existing scroll handler. When the user scrolls more than 120px from the bottom, a floating button with a down arrow SVG appears above the input bar with `animate-fade-in`. Clicking calls `scrollToBottom(true)` and hides the button. Uses `aria-label="Scroll to bottom"` for accessibility. Deployed to Cloudflare Workers.

