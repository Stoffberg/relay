# Markdown Renderer Has No Explicit HTML Sanitization

**Type:** bug
**Severity:** medium
**Component:** web
**Reported:** 2026-02-27

## Description

The `MarkdownContent` component in `markdown-content.tsx` renders AI-generated content through `ReactMarkdown` with `remarkGfm` and `rehypeHighlight` plugins, but does not include `rehype-sanitize` for explicit HTML sanitization.

While `ReactMarkdown` escapes HTML by default (it uses `react` as the compiler, which escapes text nodes), certain plugin combinations or future configuration changes could introduce XSS vectors. The `rehypeHighlight` plugin processes content through `lowlight` which generates HTML AST nodes that bypass React's text escaping.

If the AI model returns markdown containing crafted HTML that exploits a bug in rehype or highlight.js, there's no sanitization safety net.

## Expected Behavior

Add `rehype-sanitize` as a defensive measure:

```typescript
import rehypeSanitize from 'rehype-sanitize';

const rehypePlugins = [rehypeHighlight, rehypeSanitize];
```

This provides defense-in-depth: even if other plugins introduce unsafe HTML, the sanitizer catches it.

## Implementation Notes

The `rehype-sanitize` package uses a default schema based on GitHub's sanitization rules. Custom elements (like the code block wrapper) may need to be allowlisted. Add `rehype-sanitize` after `rehype-highlight` in the plugin chain so the highlight output is also sanitized.

## Resolution

Added `rehype-sanitize` (v6.0.0) to the rehype plugin chain after `rehype-highlight` in `markdown-content.tsx`. Extended the default GitHub schema to allow `className` on `code` and `span` elements so syntax highlighting classes pass through. This provides defense in depth against any XSS vectors that might be introduced through plugin interactions.

