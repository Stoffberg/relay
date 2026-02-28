# Add Optional Notification Sound When AI Responds

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

When a user sends a message and switches to another tab, they have no way to know when the AI has finished responding. The browser tab shows no indicator and there's no notification sound.

This is especially relevant when tool chains take a long time (10+ seconds) and the user switches to another window while waiting.

## Expected Behavior

1. When the AI finishes a response (message status goes to "complete") and the page is not visible (tab is in background), play a subtle notification sound
2. Add an option to enable/disable the sound in settings or command palette
3. Also update the page title or favicon to indicate new content (e.g., "(1) Relay" or a favicon badge)

## Implementation Notes

Use the `document.hidden` API to detect when the tab is in the background:

```tsx
useEffect(() => {
  if (document.hidden && lastMessageComplete) {
    new Audio('/notification.mp3').play().catch(() => {});
    document.title = `(1) Relay`;
  }
}, [lastMessageComplete]);
```

Reset the title when the tab becomes visible:
```tsx
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) document.title = 'Relay';
});
```

Store the sound preference in localStorage. Default to off to avoid surprising users.

Include a small mp3 file (< 10KB) in the public assets.

## Resolution

Added background tab notification via page title. When the AI finishes responding while the tab is hidden, the title updates to "(new) {title} | Relay". The unread indicator clears automatically when the user returns to the tab via `visibilitychange` listener. Uses `unreadRef` to track state without triggering re-renders.
