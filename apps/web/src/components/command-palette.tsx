import { useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/use-theme";
import type { SessionPreview } from "./sidebar";

interface CommandPaletteProps {
  sessions: SessionPreview[];
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}

interface CmdResult {
  type: "chat" | "action";
  id: string;
  label: string;
  meta?: string;
  isStreaming?: boolean;
  action?: () => void;
}

export function CommandPalette({ sessions, onSelectChat, onNewChat, onClose }: CommandPaletteProps) {
  const { theme, toggle } = useTheme();
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setIdx(0);
  }, [query]);

  const results: CmdResult[] = [];
  const q = query.toLowerCase().trim();

  const filtered = q
    ? sessions.filter((s) => s.title.toLowerCase().includes(q))
    : sessions.slice(0, 8);

  for (const s of filtered) {
    const isBusy = s.status === "streaming" || s.status === "waiting_for_tool";
    results.push({
      type: "chat",
      id: `c-${s.id}`,
      label: s.title,
      meta: s.messageCount > 0 ? `${s.messageCount} msg` : undefined,
      isStreaming: isBusy,
      action: () => onSelectChat(s.id),
    });
  }

  if (!q || "new chat".includes(q) || "new conversation".includes(q)) {
    results.push({
      type: "action",
      id: "new-chat",
      label: "New conversation",
      action: onNewChat,
    });
  }
  if (!q || "theme".includes(q) || "dark".includes(q) || "light".includes(q)) {
    results.push({
      type: "action",
      id: "toggle-theme",
      label: `Switch to ${theme === "dark" ? "light" : "dark"} mode`,
      action: toggle,
    });
  }

  function execute(result: CmdResult) {
    result.action?.();
    onClose();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[idx]) {
      e.preventDefault();
      execute(results[idx]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] bg-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[540px] animate-spotlight-in overflow-hidden bg-cmd border border-border rounded-[10px]"
        style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.4)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-muted shrink-0">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search conversations, actions..."
            className="flex-1 text-[14px] bg-transparent focus:outline-none text-foreground caret-accent font-sans"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 font-mono text-muted bg-surface-hover rounded-[3px]">
            esc
          </kbd>
        </div>
        <div className="max-h-[380px] overflow-y-auto py-1">
          {results.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-muted">No results</p>
            </div>
          )}
          {results.map((r, i) => {
            const sel = i === idx;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => execute(r)}
                className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                style={{
                  background: sel ? "var(--surface-active)" : "transparent",
                  borderLeft: sel ? "2px solid var(--accent)" : "2px solid transparent",
                }}
                onMouseEnter={() => setIdx(i)}
              >
                {r.type === "action" && (
                  <span className="text-[12px] text-accent">→</span>
                )}
                <span className="text-[14px] truncate flex-1 text-body">{r.label}</span>
                {r.isStreaming && (
                  <span className="text-[10px] font-mono text-muted animate-pulse">streaming</span>
                )}
                {r.meta && !r.isStreaming && (
                  <span className="text-[10px] font-mono text-dim">{r.meta}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
