# No Mobile Responsive Layout

**Type:** feature
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The frontend has no responsive breakpoints or mobile-specific layout. Key issues on mobile:

1. **Sidebar width**: Set to 380px when chat panes are visible. On phones (< 500px width), this leaves almost no room for the chat area. On very small screens (< 380px), the sidebar overflows.

2. **No sidebar toggle/collapse**: On desktop the sidebar is always visible. On mobile, it should be collapsible or slide-in, giving the full viewport to the chat.

3. **No responsive padding**: All padding is fixed (`px-6`, `py-6` = 24px). On mobile this wastes 48px of horizontal space. Should scale down to `px-3` or `px-4` on small screens.

4. **No responsive text sizing**: Font sizes are fixed across all viewports.

5. **Send button touch target**: The send button icon is 16px, well below the recommended 44px minimum touch target for mobile.

6. **No CSS media queries**: The stylesheet has zero `@media` queries. All layout relies on flexbox which mostly works but isn't optimized for mobile.

## Expected Behavior

Implement a mobile layout that:
1. Shows only the sidebar OR the chat at a time on screens < 768px
2. Has a hamburger/back button to toggle between sidebar and chat views
3. Uses smaller padding on mobile (`px-3` instead of `px-6`)
4. Ensures all touch targets are at least 44px
5. Scales the input bar appropriately for mobile keyboards

## Implementation Notes

Use Tailwind responsive prefixes (`md:`, `lg:`) to create the breakpoint system:

```tsx
// Sidebar: full width on mobile, fixed 380px on desktop
<div className="w-full md:w-[380px] md:border-r">

// Chat: hidden on mobile when sidebar is showing
<div className="hidden md:flex flex-1">
```

Add a `showSidebar` state toggled by a hamburger button visible only on `md:hidden`.

Consider using the CSS `@media (max-width: 768px)` breakpoint in `styles.css` for global adjustments like padding and font sizes.

## Resolution

Added mobile responsive layout with 768px breakpoint. On mobile, only sidebar or chat shows (not both). Added `isMobile` state with resize listener. Chat area shows a "Back" button (hidden on desktop via `md:hidden`) that navigates to home. Reduced padding on mobile for chat area (`px-3 py-4`) and input bar (`px-3 py-2`). Desktop layout unchanged.
