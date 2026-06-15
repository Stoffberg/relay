import { useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/use-theme";

interface CommandPaletteProps {
  onNewChat: () => void;
  onExport?: () => void;
  onSettings?: () => void;
  onClose: () => void;
}

interface CmdResult {
  id: string;
  label: string;
  hint?: string;
  action?: () => void;
}

const SHORTCUTS = [
  { keys: "⌘K", desc: "Open command palette" },
  { keys: "⌘N", desc: "New conversation" },
  { keys: "⌘\\", desc: "Toggle sidebar" },
  { keys: "⌘F", desc: "Search in conversation" },
  { keys: "/", desc: "Focus chat input" },
  { keys: "Enter", desc: "Send message" },
  { keys: "Esc", desc: "Close palette / dismiss" },
];

export function CommandPalette({ onNewChat, onExport, onSettings, onClose }: CommandPaletteProps) {
  const { theme, toggle } = useTheme();
  const [idx, setIdx] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const results: CmdResult[] = [
    { id: "new-chat", label: "New conversation", hint: "⌘N", action: onNewChat },
    {
      id: "toggle-theme",
      label: `Switch to ${theme === "dark" ? "light" : "dark"} mode`,
      action: toggle,
    },
  ];
  if (onExport) {
    results.push({ id: "export", label: "Export conversation", action: onExport });
  }
  results.push({ id: "settings", label: "Settings", action: onSettings });
  results.push({
    id: "shortcuts",
    label: "Keyboard shortcuts",
    action: () => setShowShortcuts(true),
  });

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
    <dialog
      open
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] bg-overlay"
      onClick={onClose}
      aria-label="Command palette"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={containerRef}
        className="w-full max-w-[540px] animate-spotlight-in overflow-hidden bg-cmd border border-border rounded-[10px]"
        style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.4)" }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
        tabIndex={-1}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[13px] font-medium text-body">Actions</span>
          <kbd className="text-[10px] px-1.5 py-0.5 font-mono text-muted bg-surface-hover rounded-[3px]">
            esc
          </kbd>
        </div>
        {showShortcuts && (
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-foreground">Keyboard Shortcuts</span>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                className="text-[10px] text-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="grid gap-1.5">
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between">
                  <span className="text-[12px] text-body">{s.desc}</span>
                  <kbd className="text-[10px] px-1.5 py-0.5 font-mono text-muted bg-surface-hover rounded-[3px]">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="py-1">
          {results.map((r, i) => {
            const sel = i === idx;
            return (
              <button
                key={r.id}
                id={`cmd-opt-${r.id}`}
                type="button"
                aria-current={sel}
                onClick={() => execute(r)}
                className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                style={{
                  background: sel ? "var(--surface-active)" : "transparent",
                  borderLeft: sel ? "2px solid var(--accent)" : "2px solid transparent",
                }}
                onMouseEnter={() => setIdx(i)}
              >
                <span className="text-[12px] text-accent">→</span>
                <span className="text-[14px] truncate flex-1 text-body">{r.label}</span>
                {r.hint && (
                  <kbd className="text-[10px] px-1.5 py-0.5 font-mono text-dim bg-surface-hover rounded-[3px]">
                    {r.hint}
                  </kbd>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}
