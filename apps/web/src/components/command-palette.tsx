import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../hooks/use-theme";
import type { SessionPreview } from "./sidebar";

interface CommandPaletteProps {
  sessions: SessionPreview[];
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onExport?: () => void;
  onSettings?: () => void;
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

const SHORTCUTS = [
  { keys: "⌘K", desc: "Open command palette" },
  { keys: "⌘N", desc: "New conversation" },
  { keys: "⌘\\", desc: "Toggle sidebar" },
  { keys: "/", desc: "Focus chat input" },
  { keys: "Enter", desc: "Send message" },
  { keys: "Esc", desc: "Close palette / dismiss" },
  { keys: "↑ ↓", desc: "Navigate results" },
];

export function CommandPalette({ sessions, onSelectChat, onNewChat, onExport, onSettings, onClose }: CommandPaletteProps) {
  const { theme, toggle } = useTheme();
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setIdx(0);
  }, [query]);

  const results: CmdResult[] = [];
  const q = query.toLowerCase().trim();

  const filtered = useMemo(() => {
    if (!q) return sessions.slice(0, 8);
    const words = q.split(/\s+/).filter(Boolean);
    return sessions
      .map((s) => {
        const title = s.title.toLowerCase();
        let score = 0;
        if (title.includes(q)) score += 10;
        if (title.startsWith(q)) score += 5;
        for (const w of words) {
          if (title.includes(w)) score += 2;
        }
        if (score === 0) {
          let ti = 0;
          for (const ch of q) {
            const found = title.indexOf(ch, ti);
            if (found === -1) return { s, score: 0 };
            ti = found + 1;
            score += 1;
          }
        }
        return { s, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.s);
  }, [sessions, q]);

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
  if (onExport && (!q || "export".includes(q) || "download".includes(q) || "save".includes(q))) {
    results.push({
      type: "action",
      id: "export",
      label: "Export conversation",
      action: onExport,
    });
  }
  if (!q || "settings".includes(q) || "preferences".includes(q) || "config".includes(q)) {
    results.push({
      type: "action",
      id: "settings",
      label: "Settings",
      action: onSettings,
    });
  }
  if (!q || "shortcuts".includes(q) || "keyboard".includes(q) || "help".includes(q) || "keys".includes(q)) {
    results.push({
      type: "action",
      id: "shortcuts",
      label: "Keyboard shortcuts",
      action: () => setShowShortcuts(true),
    });
  }

  function execute(result: CmdResult) {
    if (result.id === "shortcuts") {
      result.action?.();
      return;
    }
    result.action?.();
    onClose();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Tab") {
      e.preventDefault();
      return;
    }
    if (results.length === 0) {
      if (e.key === "Escape") onClose();
      return;
    }
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
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
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
             aria-label="Search conversations and actions"
             className="flex-1 text-[14px] bg-transparent focus:outline-none text-foreground caret-accent font-sans"
             role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="cmd-results"
            aria-activedescendant={results[idx] ? `cmd-opt-${results[idx].id}` : undefined}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 font-mono text-muted bg-surface-hover rounded-[3px]">
            esc
          </kbd>
        </div>
        {showShortcuts && (
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-foreground">Keyboard Shortcuts</span>
              <button type="button" onClick={() => setShowShortcuts(false)} className="text-[10px] text-muted hover:text-foreground">
                ✕
              </button>
            </div>
            <div className="grid gap-1.5">
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between">
                  <span className="text-[12px] text-body">{s.desc}</span>
                  <kbd className="text-[10px] px-1.5 py-0.5 font-mono text-muted bg-surface-hover rounded-[3px]">{s.keys}</kbd>
                </div>
              ))}
            </div>
          </div>
        )}
        <div id="cmd-results" role="listbox" className="max-h-[380px] overflow-y-auto py-1">
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
                id={`cmd-opt-${r.id}`}
                type="button"
                role="option"
                aria-selected={sel}
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
