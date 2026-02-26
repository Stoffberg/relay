import { useState, useSyncExternalStore } from "react";
import type { ChatSessionStore, ChatToolCall } from "../lib/chat-store";
import { MarkdownContent } from "./markdown-content";

interface MessageRowProps {
  id: string;
  store: ChatSessionStore;
}

export function MessageRow({ id, store }: MessageRowProps) {
  const msg = useSyncExternalStore(store.subscribeToMessage(id), store.getMessageSnapshot(id));
  if (!msg) return null;

  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="flex items-start gap-3">
        <div
          className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[9px] ${msg.status === "optimistic" ? "bg-dim" : "bg-muted"}`}
        />
        <p
          className={`text-[14px] leading-[1.75] whitespace-pre-wrap ${msg.status === "optimistic" ? "text-muted" : "text-body"}`}
        >
          {msg.content}
        </p>
      </div>
    );
  }

  return (
    <div className="pl-[18px] border-l-2 border-border-subtle">
      <div className="pl-4">
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <ToolCallBlock calls={msg.toolCalls} />
        )}
        {msg.status === "error" ? (
          <p className="text-[14px] leading-[1.85] text-danger">{msg.content}</p>
        ) : msg.content ? (
          <MarkdownContent content={msg.content} />
        ) : null}
        {msg.status === "streaming" && (
          <span className="inline-block w-[6px] h-[14px] bg-accent/60 animate-caret ml-0.5" />
        )}
      </div>
    </div>
  );
}

function ToolCallBlock({ calls }: { calls: ChatToolCall[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="mb-3 space-y-1">
      {calls.map((tc) => {
        const isExpanded = expandedId === tc.id;
        const isPending = tc.status === "pending" || tc.status === "executing";
        const isError = tc.status === "error";

        let parsedArgs: Record<string, unknown> | null = null;
        try {
          parsedArgs = JSON.parse(tc.toolArgs);
        } catch {
          parsedArgs = null;
        }

        const argSummary = parsedArgs ? formatArgSummary(tc.toolName, parsedArgs) : tc.toolArgs;

        return (
          <button
            key={tc.id}
            type="button"
            onClick={() => setExpandedId(isExpanded ? null : tc.id)}
            className="w-full text-left"
          >
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border transition-colors"
              style={{
                borderColor: isError ? "var(--danger)" : "var(--border)",
                background: isExpanded ? "var(--surface)" : "transparent",
              }}
            >
              {isPending ? (
                <div className="w-3 h-3 shrink-0">
                  <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : isError ? (
                <span className="text-[11px] text-danger shrink-0">✕</span>
              ) : (
                <span className="text-[11px] text-accent shrink-0">✓</span>
              )}
              <span className="text-[12px] font-mono text-accent">{tc.toolName}</span>
              <span className="text-[11px] font-mono text-muted truncate flex-1">{argSummary}</span>
              <span className="text-[10px] text-dim shrink-0">{isExpanded ? "▼" : "▶"}</span>
            </div>
            {isExpanded && (
              <div className="mt-1 rounded-[6px] bg-surface border border-border overflow-hidden">
                {(tc.output || tc.error) ? (
                  <div className="px-3 py-2">
                    <pre className={`text-[11px] font-mono whitespace-pre-wrap break-all max-h-[400px] overflow-y-auto ${tc.success === false ? "text-danger" : "text-body"}`}>
                      {tc.error || tc.output}
                    </pre>
                  </div>
                ) : isPending ? (
                  <div className="px-3 py-2">
                    <span className="text-[11px] font-mono text-muted animate-pulse">running...</span>
                  </div>
                ) : null}
              </div>
            )}
          </button>
        );
      })}
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
    case "glob":
      return typeof args.pattern === "string" ? args.pattern : "";
    case "grep":
      return `${args.pattern || ""} in ${typeof args.path === "string" ? shortenPath(args.path) : ""}`;
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
    <div className="pl-[18px] animate-fade-in">
      <div className="flex gap-1.5 items-center pl-4">
        <div className="w-1 h-1 rounded-full bg-muted animate-bounce" style={{ animationDelay: "0ms" }} />
        <div className="w-1 h-1 rounded-full bg-muted animate-bounce" style={{ animationDelay: "150ms" }} />
        <div className="w-1 h-1 rounded-full bg-muted animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}
