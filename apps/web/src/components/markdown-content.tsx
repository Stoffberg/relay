import { memo, useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), "className", "style"],
    span: [...(defaultSchema.attributes?.span || []), "className", "style"],
    pre: [...(defaultSchema.attributes?.pre || []), "className", "style"],
  },
};

const remarkPlugins = [remarkGfm];
const rehypePlugins: PluggableList = [[rehypeSanitize, sanitizeSchema], rehypeHighlight];

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((e) => console.error("Clipboard copy failed:", e));
  }, [code]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy code"
      className="absolute top-2 right-2 px-2 py-1 text-[10px] font-medium rounded-[4px] bg-surface text-muted hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function extractTextContent(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(extractTextContent).join("");
  if (children && typeof children === "object" && "props" in children) {
    return extractTextContent(
      (children as React.ReactElement<{ children?: React.ReactNode }>).props.children
    );
  }
  return String(children ?? "");
}

const components: Components = {
  pre({ children }) {
    const codeElement = children as React.ReactElement<{
      className?: string;
      children?: React.ReactNode;
    }>;
    const className = codeElement?.props?.className ?? "";
    const lang = className
      .replace(/^language-/, "")
      .replace(/^hljs\s*/, "")
      .replace(/^shiki\s*/, "");
    const code = extractTextContent(codeElement?.props?.children);

    return (
      <div
        className="group relative my-3 rounded-[8px] overflow-hidden border border-border-subtle"
        style={{ background: "var(--surface)" }}
      >
        {lang && (
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle">
            <span className="text-[10px] font-medium font-mono text-muted uppercase tracking-wider">
              {lang}
            </span>
          </div>
        )}
        <CopyButton code={code} />
        <pre className="!m-0 !bg-transparent p-4 overflow-x-auto text-[13px] leading-relaxed">
          {children}
        </pre>
      </div>
    );
  },

  code({ children, className }) {
    const isBlock =
      className?.includes("language-") ||
      className?.includes("hljs") ||
      className?.includes("shiki");
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="px-1.5 py-0.5 rounded-[3px] bg-surface text-accent text-[13px] font-mono">
        {children}
      </code>
    );
  },

  p({ children }) {
    return <p className="mb-3 last:mb-0 leading-[1.85] text-[14px]">{children}</p>;
  },

  ul({ children }) {
    return (
      <ul className="mb-3 last:mb-0 pl-5 space-y-1 list-disc marker:text-ghost">{children}</ul>
    );
  },

  ol({ children }) {
    return (
      <ol className="mb-3 last:mb-0 pl-5 space-y-1 list-decimal marker:text-ghost">{children}</ol>
    );
  },

  li({ children }) {
    return <li className="leading-[1.85] text-[14px]">{children}</li>;
  },

  h1({ children }) {
    return (
      <h1 className="text-lg font-semibold mb-3 mt-4 first:mt-0 text-foreground">{children}</h1>
    );
  },

  h2({ children }) {
    return (
      <h2 className="text-base font-semibold mb-2 mt-3 first:mt-0 text-foreground">{children}</h2>
    );
  },

  h3({ children }) {
    return (
      <h3 className="text-sm font-semibold mb-2 mt-3 first:mt-0 text-foreground">{children}</h3>
    );
  },

  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-accent/40 pl-3 my-3 text-body italic">
        {children}
      </blockquote>
    );
  },

  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent hover:text-accent/80 underline underline-offset-2"
      >
        {children}
      </a>
    );
  },

  hr() {
    return <hr className="my-4 border-border" />;
  },

  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto rounded-[8px] border border-border">
        <table className="w-full text-sm">{children}</table>
      </div>
    );
  },

  thead({ children }) {
    return <thead className="bg-surface">{children}</thead>;
  },

  th({ children }) {
    return (
      <th className="px-3 py-2 text-left font-medium text-foreground border-b border-border">
        {children}
      </th>
    );
  },

  td({ children }) {
    return <td className="px-3 py-2 border-b border-border-subtle">{children}</td>;
  },

  strong({ children }) {
    return <strong className="font-semibold text-foreground">{children}</strong>;
  },

  em({ children }) {
    return <em className="italic text-body">{children}</em>;
  },
};

export const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  const trimmed = useMemo(() => content.replace(/\n$/, ""), [content]);

  return (
    <div className="markdown-body text-foreground">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {trimmed}
      </ReactMarkdown>
    </div>
  );
});
