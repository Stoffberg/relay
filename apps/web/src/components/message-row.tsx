import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, ChatToolCall } from "../lib/chat-store";
import type { Verification } from "../spacetime";
import { MarkdownContent } from "./markdown-content";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function formatMessageTime(ts?: number): string | undefined {
  if (!ts) return undefined;
  const d = new Date(ts);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const diff = Date.now() - ts;
  if (diff < 86_400_000) return time;
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${date}, ${time}`;
}

interface MessageRowProps {
  msg: ChatMessage;
  verification?: Verification;
}

export const MessageRow = memo(function MessageRow({ msg, verification }: MessageRowProps) {
  const isUser = msg.role === "user";

  if (isUser) {
    return <UserMessageRow msg={msg} />;
  }

  return <AssistantMessageRow msg={msg} verification={verification} />;
});

function UserMessageRow({ msg }: { msg: ChatMessage }) {
  const isPending = msg.status === "optimistic" || msg.status === "queued";
  const canEdit = msg.status === "complete" && msg.sessionId;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.content || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const startEdit = useCallback(() => {
    setEditText(msg.content || "");
    setEditing(true);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.selectionStart = el.value.length;
      }
    });
  }, [msg.content]);

  const submitEdit = useCallback(async () => {
    if (!editText.trim() || !msg.sessionId) return;
    setEditing(false);
    try {
      const res = await fetch(`${API_URL}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: msg.sessionId,
          message_id: msg.id,
          content: editText.trim(),
          owner_token: localStorage.getItem("relay-owner-token") || "",
        }),
      });
      if (!res.ok) {
        console.error("Edit failed:", res.status, await res.text());
      }
    } catch (e) {
      console.error("Edit failed:", e);
    }
  }, [editText, msg.id, msg.sessionId]);

  if (editing) {
    return (
      <div className="flex items-start gap-3 text-body" title={formatMessageTime(msg.createdAt)}>
        <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-[9px] bg-accent" />
        <div className="flex-1 min-w-0">
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitEdit(); }
              if (e.key === "Escape") setEditing(false);
            }}
            rows={Math.min(editText.split("\n").length + 1, 10)}
            className="w-full text-[14px] leading-[1.75] bg-transparent text-body border border-accent/30 rounded-[4px] px-2 py-1 resize-none focus:outline-none focus:border-accent caret-accent"
          />
          <div className="flex items-center gap-2 mt-1">
            <button type="button" onClick={submitEdit} className="text-[11px] font-medium px-2.5 py-1 rounded-[4px] bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
              Save & regenerate
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-[11px] font-medium px-2.5 py-1 text-dim hover:text-muted transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`group/msg flex items-start gap-3 relative ${isPending ? "text-muted" : "text-body"}`} title={formatMessageTime(msg.createdAt)}>
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[9px] ${isPending ? "bg-dim" : "bg-muted"}`} />
      <div className="text-[14px] leading-[1.75] break-words min-w-0">
        <MarkdownContent content={msg.content} />
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={startEdit}
          className="absolute top-0 right-0 px-1.5 py-0.5 text-[10px] font-medium rounded-[4px] text-muted hover:text-foreground transition-colors opacity-0 group-hover/msg:opacity-100 focus:opacity-100"
          aria-label="Edit message"
        >
          Edit
        </button>
      )}
    </div>
  );
}

function AssistantMessageRow({ msg, verification }: { msg: ChatMessage; verification?: Verification }) {
  const canRegenerate = msg.status === "complete" && msg.sessionId;

  const handleRegenerate = useCallback(async () => {
    if (!msg.sessionId) return;
    try {
      const res = await fetch(`${API_URL}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: msg.sessionId,
          message_id: msg.id,
          owner_token: localStorage.getItem("relay-owner-token") || "",
        }),
      });
      if (!res.ok) {
        console.error("Regenerate failed:", res.status, await res.text());
      }
    } catch (e) {
      console.error("Regenerate failed:", e);
    }
  }, [msg.id, msg.sessionId]);

  return (
    <div className="group/msg pl-[18px] border-l-2 border-border-subtle" title={formatMessageTime(msg.createdAt)}>
      <div className="pl-4">
        {msg.status === "error" ? (
          <div>
            <p className="text-[14px] leading-[1.85] text-danger">{msg.content}</p>
            {msg.retryText && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("relay:retry", { detail: { text: msg.retryText, errorId: msg.id } }))}
                className="mt-1 text-[11px] font-medium px-2.5 py-1 rounded-[4px] text-danger border border-danger/30 hover:bg-danger-soft transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        ) : msg.segments && msg.segments.length > 0 ? (
          msg.segments.map((seg, i) =>
            seg.type === "text" ? (
              <MarkdownContent key={i} content={seg.content} />
            ) : (
              <ToolCallBlock key={i} calls={seg.calls} />
            )
          )
        ) : msg.content ? (
          <>
            <MarkdownContent content={msg.content} />
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <ToolCallBlock calls={msg.toolCalls} />
            )}
          </>
        ) : msg.toolCalls && msg.toolCalls.length > 0 ? (
          <ToolCallBlock calls={msg.toolCalls} />
        ) : null}
        {msg.status === "streaming" && (
          <span className="inline-block w-[6px] h-[14px] bg-accent/60 animate-caret ml-0.5" />
        )}
      </div>
      {msg.status === "complete" && (
        <div className="flex items-center gap-1.5 mt-2 pl-4">
          {msg.completionTokens != null && (
            <span className="text-[9px] font-mono text-dim" title={`Prompt: ${msg.promptTokens ?? 0}, Completion: ${msg.completionTokens}`}>
              {msg.completionTokens} tok
            </span>
          )}
          {verification && <VerificationBadge verification={verification} />}
          {canRegenerate && (
            <button
              type="button"
              onClick={handleRegenerate}
              className="px-1.5 py-0.5 text-[10px] font-medium rounded-[4px] text-muted hover:text-foreground transition-colors"
              aria-label="Regenerate response"
            >
              Regen
            </button>
          )}
          {msg.content && <CopyMessageButton content={msg.content} />}
        </div>
      )}
    </div>
  );
}

function VerificationBadge({ verification }: { verification: Verification }) {
  const [showReason, setShowReason] = useState(false);

  if (verification.passed) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded-[4px] bg-accent/10 text-accent"
        title="Verification passed"
      >
        ✓ verified
      </span>
    );
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setShowReason(!showReason)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded-[4px] bg-warning/10 text-warning cursor-pointer hover:bg-warning/20 transition-colors"
        title={verification.reason || "Verification failed"}
      >
        ↻ continued
      </button>
      {showReason && verification.reason && (
        <span className="absolute top-full left-0 mt-1 z-10 px-2.5 py-1.5 text-[11px] text-body bg-surface border border-border rounded-[6px] shadow-lg whitespace-pre-wrap max-w-[300px]">
          {verification.reason}
        </span>
      )}
    </span>
  );
}

function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [content]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="px-1.5 py-0.5 text-[10px] font-medium rounded-[4px] text-muted hover:text-foreground transition-colors"
      aria-label="Copy message"
    >
      {copied ? "✓" : "Copy"}
    </button>
  );
}

function ToolCallBlock({ calls }: { calls: ChatToolCall[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="mb-3 space-y-1">
      {calls.map((tc) => (
        <ToolCallPill
          key={tc.id}
          tc={tc}
          isExpanded={expandedId === tc.id}
          onToggle={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
        />
      ))}
    </div>
  );
}

function ToolCallPill({ tc, isExpanded, onToggle }: { tc: ChatToolCall; isExpanded: boolean; onToggle: () => void }) {
  const isPending = tc.status === "generating" || tc.status === "pending" || tc.status === "executing";
  const isError = tc.status === "error";
  const preRef = useRef<HTMLPreElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const el = preRef.current;
    if (!el) return;
    const check = () => setHasOverflow(el.scrollHeight > el.clientHeight);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isExpanded, tc.output, tc.error]);

  const argSummary = useMemo(() => {
    try {
      const parsed = JSON.parse(tc.toolArgs);
      return formatArgSummary(tc.toolName, parsed);
    } catch {
      return tc.toolArgs;
    }
  }, [tc.toolArgs, tc.toolName]);

  const handleToggle = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) { onToggle(); return; }
    const rectBefore = btn.getBoundingClientRect();
    onToggle();
    requestAnimationFrame(() => {
      const rectAfter = btn.getBoundingClientRect();
      const delta = rectAfter.top - rectBefore.top;
      if (Math.abs(delta) > 1) {
        const scroller = btn.closest(".overflow-y-auto");
        if (scroller) {
          scroller.scrollTop += delta;
        }
      }
    });
  }, [onToggle]);

  return (
    <div className="w-full">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="w-full text-left"
        aria-expanded={isExpanded}
        aria-label={`${tc.toolName} tool call, ${isError ? "failed" : isPending ? "running" : "succeeded"}`}
      >
        <span
          className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border transition-colors"
          style={{
            borderColor: isError ? "var(--danger)" : "var(--border)",
            background: isExpanded ? "var(--surface)" : "transparent",
          }}
        >
          {isPending ? (
            <span className="w-3 h-3 shrink-0 inline-block">
              <span className="block w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
            </span>
          ) : isError ? (
            <span className="text-[11px] text-danger shrink-0">✕</span>
          ) : (
            <span className="text-[11px] text-accent shrink-0">✓</span>
          )}
          <span className="text-[12px] font-mono text-accent">{tc.toolName}</span>
          {isError && <span className="text-[10px] font-medium text-danger">failed</span>}
          <span className="text-[11px] font-mono text-muted truncate flex-1">{argSummary}</span>
          <span className="text-[10px] text-dim shrink-0">{isExpanded ? "▼" : "▶"}</span>
        </span>
      </button>
      {isExpanded && (
        <div className="mt-1 rounded-[6px] bg-surface border border-border overflow-hidden">
          {(tc.output || tc.error) ? (
            <div className="px-3 py-2">
              {(tc.output || tc.error || "").includes("(truncated") && (
                <span className="inline-block text-[10px] font-medium text-warning mb-1 px-1.5 py-0.5 rounded bg-warning/10">Truncated</span>
              )}
              <div className="relative">
                <pre ref={preRef} className={`text-[11px] font-mono whitespace-pre-wrap break-all max-h-[400px] overflow-y-auto ${tc.success === false ? "text-danger" : "text-body"}`}>
                  {tc.error || tc.output}
                </pre>
                {hasOverflow && (
                  <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-surface to-transparent pointer-events-none" />
                )}
              </div>
            </div>
          ) : isPending ? (
            <div className="px-3 py-2">
              <span className="text-[11px] font-mono text-muted animate-pulse">running...</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function formatArgSummary(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "file_read":
    case "file_write":
    case "file_edit":
      return typeof args.path === "string" ? shortenPath(args.path) : "";
    case "shell_exec":
      return typeof args.command === "string"
        ? args.command.length > 60 ? args.command.slice(0, 57) + "..." : args.command
        : "";
    case "glob": {
      const pat = typeof args.pattern === "string" ? args.pattern : "";
      const dir = typeof args.path === "string" ? shortenPath(args.path) : "";
      return dir ? `${pat} in ${dir}` : pat;
    }
    case "grep":
      return `${args.pattern || ""} in ${typeof args.path === "string" ? shortenPath(args.path) : ""}`;
    case "wait": {
      const total = typeof args.seconds === "number" ? args.seconds : 0;
      const remaining = typeof args.remaining === "number" ? args.remaining : total;
      if (remaining === 0) return `${total}s`;
      return `${remaining}s remaining`;
    }
    default:
      return "";
  }
}

function shortenPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return ".../" + parts.slice(-3).join("/");
}

export function ThinkingIndicator() {
  return (
    <div className="pl-[18px] animate-fade-in" role="status" aria-label="Relay is thinking">
      <div className="flex gap-1.5 items-center pl-4">
        <div className="w-1 h-1 rounded-full bg-muted animate-bounce" style={{ animationDelay: "0ms" }} />
        <div className="w-1 h-1 rounded-full bg-muted animate-bounce" style={{ animationDelay: "150ms" }} />
        <div className="w-1 h-1 rounded-full bg-muted animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}
