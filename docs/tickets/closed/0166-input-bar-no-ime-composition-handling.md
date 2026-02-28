# Input Bar Does Not Handle IME Composition Events

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The input bar's Enter key handler fires during IME (Input Method Editor) composition, which affects Chinese, Japanese, and Korean input. When a CJK user types a character and presses Enter to confirm the composition, the input bar intercepts the Enter keypress and submits the message instead of confirming the character.

In `apps/web/src/components/input-bar.tsx` around lines 36-39:

```typescript
if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    onSend();
}
```

There's no check for `e.isComposing` (the standard way to detect if an IME composition is in progress) or `e.nativeEvent.isComposing`.

## Steps to Reproduce

1. Switch to a CJK input method (e.g., Chinese Pinyin)
2. Type some pinyin characters
3. Press Enter to confirm the character selection
4. The message is submitted instead of confirming the IME selection

## Expected Behavior

Check `e.nativeEvent.isComposing` before handling Enter:

```typescript
if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault();
    onSend();
}
```

## Resolution

Added `!e.nativeEvent.isComposing` check to the Enter key handler in input-bar.tsx. Enter presses during IME composition (CJK input) are now ignored, allowing the user to confirm character selection without triggering message send.

