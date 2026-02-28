# Scroll-to-Bottom Jumps Instead of Smooth Scrolling

**Type:** bug
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

In `apps/web/src/routes/chat.$sessionId.tsx`, `scrollToBottom()` uses `scrollRef.current.scrollTo({ top: scrollHeight })` without `behavior: 'smooth'`. This causes the chat to jump instantly to the bottom rather than smoothly scrolling.

During streaming, each new chunk triggers a scroll, resulting in a visually jarring series of jumps rather than a fluid reading experience.

## Expected Behavior

Use smooth scrolling for auto-scroll during streaming, but instant scroll when the user sends a message (they want to see the response immediately):

```tsx
const scrollToBottom = useCallback((force = false) => {
  if (!force && !userNearBottomRef.current) return;
  requestAnimationFrame(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: force ? "instant" : "smooth",
    });
  });
}, []);
```

`force=true` (on send) uses instant. Regular auto-scroll during streaming uses smooth.

## Implementation Notes

Be careful with smooth scroll frequency. During fast streaming, many scroll events fire per second. `behavior: 'smooth'` animations may queue up or conflict. Consider debouncing the scroll callback (e.g., `requestAnimationFrame` already helps, but a 100ms debounce on the smooth variant would be safer).

## Resolution

Updated scrollToBottom in chat.$sessionId.tsx to pass behavior: force ? "instant" : "smooth" to scrollTo. Force scrolls (on send) jump instantly, while auto-scrolls during streaming use smooth behavior. The existing requestAnimationFrame wrapper prevents animation queueing. Web deployed.
