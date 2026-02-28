# highlight.js Bundles All 190 Languages Into Frontend

**Type:** bug
**Severity:** high
**Component:** web
**Reported:** 2026-02-27

## Description

The `rehype-highlight` plugin used in `markdown-content.tsx` pulls in the full `highlight.js` library which ships all ~190 language grammars by default. Uncompressed, this is ~1MB; minified and gzipped it's still ~300KB. For a chat app that primarily highlights 5 to 10 languages (JavaScript, TypeScript, Python, Rust, HTML, CSS, JSON, bash), this is massive waste.

In `apps/web/src/components/markdown-content.tsx` line 4:
```typescript
import rehypeHighlight from 'rehype-highlight';
```

And in `apps/web/src/styles.css` line 3:
```css
@import "highlight.js/styles/github-dark-dimmed.css";
```

## Expected Behavior

Option A (recommended): Replace `rehype-highlight` with `rehype-shiki`. Shiki uses VS Code's TextMate grammars and produces pre-colored HTML with zero client-side JS for highlighting. Better quality output, near-zero bundle cost for the highlighting engine itself.

Option B (quick win): Configure `rehype-highlight` to use `lowlight/lib/common` (34 common languages, ~100KB saved) or register only the specific languages needed:

```typescript
import { common } from 'lowlight';
// or import specific: import js from 'highlight.js/lib/languages/javascript';
```

## Implementation Notes

Estimated savings: 150 to 300KB gzipped depending on approach. This is the single largest bundle size optimization available.

If going with Shiki, use the WASM-based `shiki` package with lazy grammar loading. Only grammars used in actual code blocks get downloaded.

## Resolution

Installed `lowlight` as a direct dependency and configured `rehype-highlight` to use a custom lowlight instance with only common languages (~35 instead of 190). Created `lowlightInstance` via `createLowlight(common)` and passed it as an option to rehype-highlight. Estimated ~150KB gzipped savings.

