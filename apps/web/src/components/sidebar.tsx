import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import { useNavigate } from "@tanstack/react-router";
import type { DbConnection } from "../spacetime";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error" | "reconnecting";

export interface SessionPreview {
  id: string;
  title: string;
  status: "idle" | "streaming" | "waiting_for_tool" | "error";
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage?: string;
  isArchived: boolean;
  model?: string;
}

interface SidebarProps {
  sessions: SessionPreview[];
  activeSessionId: string | null;
  connState: ConnectionState;
  hasChatOpen: boolean;
  hasOnlineAgent: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 172_800_000) return "Yesterday";
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type DateGroup = "Today" | "Yesterday" | "This week" | "This month" | "Older";

function getDateGroup(ms: number): DateGroup {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekAgo = new Date(today.getTime() - 6 * 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  if (ms >= today.getTime()) return "Today";
  if (ms >= yesterday.getTime()) return "Yesterday";
  if (ms >= weekAgo.getTime()) return "This week";
  if (ms >= monthStart.getTime()) return "This month";
  return "Older";
}

export const Sidebar = memo(function Sidebar({
  sessions,
  activeSessionId,
  connState,
  hasChatOpen,
  hasOnlineAgent,
  collapsed,
  onToggleCollapse,
  onSelectChat,
  onNewChat,
}: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("relay-pinned") || "[]")); } catch { return new Set(); }
  });
  const togglePin = useCallback((id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("relay-pinned", JSON.stringify([...next]));
      return next;
    });
  }, []);
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; session: SessionPreview } | null>(null);
  const navigate = useNavigate();
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const startEditing = useCallback((session: SessionPreview) => {
    setEditingId(session.id);
    setEditText(session.title);
    requestAnimationFrame(() => editRef.current?.select());
  }, []);

  const { getConnection } = useSpacetimeDB();

  const saveEdit = useCallback(() => {
    if (!editingId || !editText.trim()) { setEditingId(null); return; }
    const conn = getConnection() as DbConnection | null;
    if (conn) conn.reducers.updateSessionTitle({ sessionId: editingId, title: editText.trim() });
    setEditingId(null);
  }, [editingId, editText, getConnection]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onKey); };
  }, [ctxMenu]);

  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const filteredSessions = useMemo(() => {
    let list = sessions;
    if (!showArchived) {
      list = list.filter(s => !s.isArchived);
    }
    if (filter.trim()) {
      const q = filter.toLowerCase();
      list = list.filter(s => s.title.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const ap = pinnedIds.has(a.id) ? 1 : 0;
      const bp = pinnedIds.has(b.id) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return b.updatedAt - a.updatedAt;
    });
  }, [sessions, filter, pinnedIds, showArchived]);

  const archivedCount = useMemo(() => sessions.filter(s => s.isArchived).length, [sessions]);

  const groupStarts = useMemo(() => {
    const map = new Map<number, DateGroup>();
    let lastGroup: DateGroup | null = null;
    for (let i = 0; i < filteredSessions.length; i++) {
      const group = getDateGroup(filteredSessions[i].updatedAt);
      if (group !== lastGroup) {
        map.set(i, group);
        lastGroup = group;
      }
    }
    return map;
  }, [filteredSessions]);

  if (collapsed && hasChatOpen) {
    return (
      <nav
        aria-label="Chat sessions"
        className="flex flex-col items-center shrink-0 py-4 gap-3 transition-all duration-300 select-none"
        style={{ width: "48px", borderRight: "1px solid var(--border)" }}
      >
        <button type="button" onClick={onToggleCollapse} aria-label="Expand sidebar" className="text-[14px] text-muted hover:text-foreground transition-colors">
          ›
        </button>
        <button type="button" onClick={onNewChat} aria-label="New conversation" className="text-accent hover:text-accent/80 transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Chat sessions"
      className="flex flex-col shrink-0 transition-all duration-300 select-none"
      style={{
        width: hasChatOpen ? "380px" : "100%",
        maxWidth: hasChatOpen ? "380px" : "none",
        borderRight: hasChatOpen ? "1px solid var(--border)" : "none",
      }}
    >
      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h1 className="text-[32px] font-bold leading-none tracking-[-0.03em] text-foreground">
              Relay
            </h1>
            <div className="flex items-center gap-3 mt-1.5">
              <ConnectionIndicator state={connState} />
              {hasOnlineAgent && (
                <span className="flex items-center gap-1.5">
                  <span className="w-[5px] h-[5px] rounded-full bg-accent" />
                  <span className="text-[11px] font-mono text-muted">agent</span>
                </span>
              )}

            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onNewChat}
              className="text-[12px] font-medium px-3 py-1.5 transition-colors text-accent border border-accent-border rounded-[6px] bg-accent-soft hover:bg-accent/10"
            >
              + New
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 py-2 border-t border-border border-b px-2.5">
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter conversations"
            className="flex-1 min-w-0 text-[11px] px-2 py-1 font-mono bg-transparent text-body placeholder:text-dim rounded"
          />
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived(prev => !prev)}
              aria-label={showArchived ? "Hide archived" : "Show archived"}
              className={`text-[10px] font-mono shrink-0 transition-colors ${showArchived ? "text-accent" : "text-dim hover:text-muted"}`}
            >
              {showArchived ? "all" : `${archivedCount} archived`}
            </button>
          )}
          <span className="text-[11px] font-mono text-dim shrink-0">
            {filteredSessions.length}/{sessions.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {connState === "connecting" && (
          <div className="px-5 py-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse bg-surface-hover rounded-[4px]" />
            ))}
          </div>
        )}
        {connState === "connected" && filteredSessions.length === 0 && !filter && (
          <div className="py-20 text-center">
            <p className="text-[13px] mb-3 text-muted">No conversations yet</p>
            <button
              type="button"
              onClick={onNewChat}
              className="text-[12px] px-4 py-2 transition-colors text-accent border border-accent-border rounded-[6px] bg-accent-soft"
            >
              Start a conversation
            </button>
          </div>
        )}
        {filteredSessions.map((session, rowIdx) => {
          const isActive = session.id === activeSessionId;
          const isHov = session.id === hoveredId;
          const isBusy = session.status === "streaming" || session.status === "waiting_for_tool";
          const isError = session.status === "error";
          const groupLabel = groupStarts.get(rowIdx);
          return (
            <div
              key={session.id}
              className="relative"
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
              onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, session }); }}
            >
              {groupLabel && (
                <div className="px-5 pt-3 pb-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-dim">{groupLabel}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onSelectChat(session.id)}
                aria-label={`Open conversation: ${session.title}`}
                className="w-full text-left transition-all duration-150"
                style={{
                  background: isActive
                    ? "var(--surface-active)"
                    : isHov
                      ? "var(--surface-hover)"
                      : "transparent",
                  borderBottom: "1px solid var(--border-subtle)",
                  borderLeft: isActive
                    ? "2px solid var(--accent)"
                    : isError
                      ? "2px solid #ef4444"
                      : "2px solid transparent",
                }}
              >
                <div className="flex items-center gap-0 px-5 py-3">
                  <span className="text-[10px] w-5 shrink-0 tabular-nums font-mono text-dim">
                    {pinnedIds.has(session.id) ? "•" : String(filteredSessions.length - rowIdx).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0 pl-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {session.status === "streaming" && (
                          <div className="w-[6px] h-[6px] rounded-full shrink-0 animate-pulse bg-accent" />
                        )}
                        {session.status === "waiting_for_tool" && (
                          <div className="w-3 h-3 shrink-0">
                            <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                        {isError && (
                          <div className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: "#ef4444" }} />
                        )}
                        {editingId === session.id ? (
                          <input
                            ref={editRef}
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
                              if (e.key === "Escape") setEditingId(null);
                              e.stopPropagation();
                            }}
                            onBlur={saveEdit}
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Rename conversation"
                            className="text-[14px] font-medium bg-transparent border-b border-accent text-foreground focus:outline-none w-full"
                          />
                        ) : (
                          <span
                            className={`text-[14px] font-medium truncate ${isActive ? "text-foreground" : "text-body"}`}
                            onDoubleClick={(e) => { e.stopPropagation(); startEditing(session); }}
                          >
                            {session.title}
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] shrink-0 ml-2 tabular-nums font-mono ${isError ? "text-danger" : "text-dim"}`}>
                        {isError
                          ? "error"
                          : isBusy
                            ? session.status === "waiting_for_tool"
                              ? "tools"
                              : "streaming"
                            : session.updatedAt > 0
                              ? relativeTime(session.updatedAt)
                              : ""}
                      </span>
                    </div>
                    {(session.lastMessage || session.isArchived || session.model) && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {session.isArchived && <span className="text-[9px] font-mono text-dim">archived</span>}
                        {session.model && <span className="text-[9px] font-mono text-dim truncate">{session.model.split("/").pop()}</span>}
                        {session.lastMessage && <p className="text-[11px] text-dim truncate">{session.lastMessage}</p>}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
      {ctxMenu && (
        <div
          className="fixed z-50 py-1 min-w-[160px] bg-cmd border border-border rounded-[6px] animate-scale-in"
          style={{ top: ctxMenu.y, left: ctxMenu.x, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={() => { startEditing(ctxMenu.session); setCtxMenu(null); }} className="w-full text-left px-3 py-1.5 text-[12px] text-body hover:bg-surface-hover transition-colors">Rename</button>
          <button type="button" onClick={() => { togglePin(ctxMenu.session.id); setCtxMenu(null); }} className="w-full text-left px-3 py-1.5 text-[12px] text-body hover:bg-surface-hover transition-colors">{pinnedIds.has(ctxMenu.session.id) ? "Unpin" : "Pin"}</button>
          <button type="button" onClick={() => { navigator.clipboard.writeText(ctxMenu.session.id).catch(() => {}); setCtxMenu(null); }} className="w-full text-left px-3 py-1.5 text-[12px] text-body hover:bg-surface-hover transition-colors">Copy session ID</button>
          <div className="my-1 border-t border-border" />
          <button type="button" onClick={() => {
            const conn = getConnection() as DbConnection | null;
            if (conn) conn.reducers.archiveSession({ sessionId: ctxMenu.session.id, archived: !ctxMenu.session.isArchived });
            setCtxMenu(null);
          }} className="w-full text-left px-3 py-1.5 text-[12px] text-body hover:bg-surface-hover transition-colors">{ctxMenu.session.isArchived ? "Unarchive" : "Archive"}</button>
          <button type="button" onClick={() => {
            const conn = getConnection() as DbConnection | null;
            const sid = ctxMenu.session.id;
            if (conn) conn.reducers.deleteSession({ sessionId: sid });
            if (activeSessionId === sid) navigate({ to: "/" });
            setCtxMenu(null);
          }} className="w-full text-left px-3 py-1.5 text-[12px] text-danger hover:bg-danger/10 transition-colors">Delete</button>
        </div>
      )}
    </nav>
  );
});

function ConnectionIndicator({ state }: { state: ConnectionState }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const displayState = hydrated ? state : "connecting";

  const dotColors: Record<ConnectionState, string> = {
    connecting: "#fbbf24",
    connected: "#34d399",
    disconnected: "var(--dim)",
    error: "#ef4444",
    reconnecting: "#fbbf24",
  };
  const labels: Record<ConnectionState, string> = {
    connecting: "connecting",
    connected: "connected",
    disconnected: "disconnected",
    error: "connection error",
    reconnecting: "reconnecting",
  };

  const dotColor = dotColors[displayState];
  const pulseClass = displayState === "connecting" || displayState === "reconnecting" ? "animate-pulse" : "";

  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`w-[5px] h-[5px] rounded-full ${pulseClass}`}
        style={{ background: dotColor }}
      />
      <span className="text-[11px] font-mono text-muted">
        {labels[displayState]}
      </span>
    </span>
  );
}
