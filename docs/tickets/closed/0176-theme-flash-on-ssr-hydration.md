# Dark Mode Flash on SSR Hydration

**Type:** bug
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The `useTheme` hook initializes the theme state to `"dark"` and then reads the user's preference from `localStorage` in a `useEffect`. During SSR and the first render after hydration, the page always renders in dark mode. If the user's stored preference is `"light"`, there's a visible flash of dark content before the theme switches.

In `apps/web/src/hooks/use-theme.tsx` around line 16-22:

```typescript
const [theme, setTheme] = useState<"dark" | "light">("dark");

useEffect(() => {
    const stored = localStorage.getItem("theme") as "dark" | "light" | null;
    if (stored) setTheme(stored);
}, []);
```

## Expected Behavior

Read the theme synchronously before React hydrates. Options:

1. Inject a `<script>` tag in the HTML `<head>` that reads localStorage and sets the `class` on `<html>` before any CSS is applied
2. Use a cookie to pass the theme preference to the SSR renderer so it renders the correct theme on the server
3. Use `useSyncExternalStore` with `getServerSnapshot` returning "dark" and `getSnapshot` returning the localStorage value

## Implementation Notes

The inline script approach is most common:

```html
<script>
    const t = localStorage.getItem("theme");
    if (t === "light") document.documentElement.classList.replace("dark", "light");
</script>
```

This runs before the browser paints, eliminating the flash entirely.

## Resolution

Added an inline `<script>` in `RootShell` head that synchronously reads `localStorage("relay-theme")` and adds the `light` class to `<html>` before React hydrates. Also checks `prefers-color-scheme: light` as a fallback when no stored preference exists. This runs before any paint, eliminating the dark-to-light flash. Deployed to Cloudflare Workers.

