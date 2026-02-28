# Add Toast/Notification System for Transient Events

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

There's no global notification system for transient events. Errors are shown inline as fake assistant messages, connection changes just update the sidebar, and copy success shows inline text that's easy to miss. The app needs a toast system for events like:

- "Connection lost, attempting to reconnect..."
- "Agent disconnected"
- "Message queued (agent offline)"
- "Copied to clipboard"
- "Failed to send message"
- "Rate limited, try again in X seconds"

## Expected Behavior

Add a lightweight toast notification component that:
1. Appears in a corner (bottom-right or top-center)
2. Auto-dismisses after 3 to 5 seconds
3. Supports severity levels (info, warning, error, success)
4. Can be stacked (multiple toasts at once)
5. Is accessible (aria-live region)

## Implementation Notes

This provides the infrastructure for many other tickets: copy feedback (0037), retry button (0026), connection quality (0103), and any future user-facing notifications. Build it once, use it everywhere.

## Resolution

Created `apps/web/src/components/toast.tsx` with a module-level toast store, `showToast(message, level)` export function, and `ToastContainer` component. Supports info/success/warning/error levels, auto-dismisses after 4 seconds, manual dismiss, stacked display in bottom-right corner with `aria-live="polite"`. Added `ToastContainer` to root layout.

