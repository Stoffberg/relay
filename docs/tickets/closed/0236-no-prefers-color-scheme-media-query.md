# Theme Ignores System prefers-color-scheme Preference

**Type:** feature
**Severity:** low
**Component:** web
**Reported:** 2026-02-27

## Description

The theme system always defaults to "dark" on first visit, ignoring the user's operating system color scheme preference. Users with `prefers-color-scheme: light` set in their OS will see dark mode until they manually toggle it.

The `use-theme.tsx` hook initializes state with `"dark"` and only checks localStorage. It never reads the `prefers-color-scheme` media query.

## Expected Behavior

On first visit (no localStorage value), respect the system preference:
1. Check `window.matchMedia("(prefers-color-scheme: light)").matches`
2. If true, default to light mode
3. If false or unavailable, default to dark mode
4. Once the user manually toggles, persist their choice in localStorage (already works)

## Implementation Notes

```tsx
const getDefaultTheme = (): Theme => {
  const stored = localStorage.getItem("relay-theme") as Theme | null;
  if (stored) return stored;
  if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
};

const [theme, setTheme] = useState<Theme>(getDefaultTheme);
```

Also consider listening for changes to the media query (user changes OS theme while app is open).

## Resolution

Added `getDefaultTheme()` helper in `use-theme.tsx` that checks localStorage first, then `window.matchMedia("(prefers-color-scheme: light)")`, defaulting to dark. SSR safely returns "dark" since `window` isn't available. On first visit without a stored preference, the OS color scheme is respected. Deployed to Cloudflare Workers.
