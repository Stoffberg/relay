# No Visual Feedback After Copying Code Block

**Type:** bug
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

In `apps/web/src/components/markdown-content.tsx`, the code block copy button calls `navigator.clipboard.writeText()` but provides no visual feedback after copying. The user clicks the button and nothing visually changes, so they don't know if the copy worked.

Additionally, there's no error handling if `navigator.clipboard.writeText()` fails (which happens in non-secure contexts or when the clipboard API isn't available).

## Expected Behavior

1. After clicking copy, briefly change the button icon from a copy icon to a checkmark
2. Revert back to the copy icon after 2 seconds
3. If copy fails, show the original icon (no change) or a brief error indicator

## Implementation Notes

In `markdown-content.tsx`, add a `copied` state to the CopyButton:

```tsx
const [copied, setCopied] = useState(false);

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  } catch {
    // Fallback or ignore
  }
};

return <button>{copied ? "✓" : "Copy"}</button>;
```

## Resolution

Added copied state to CopyButton in markdown-content.tsx. After a successful clipboard write, the button text changes from "Copy" to "Copied!" for 2 seconds, then reverts. Failed clipboard writes are silently caught. Web deployed.
