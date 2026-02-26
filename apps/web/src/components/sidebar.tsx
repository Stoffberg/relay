import { useState } from "react";
import { useTheme } from "../hooks/use-theme";
import type { ConnectionState } from "../spacetime";

export interface SessionPreview {
  id: string;
  title: string;
  status: "idle" | "streaming" | "waiting_for_tool" | "error";
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

interface SidebarProps {
  sessions: SessionPreview[];
  activeSessionId: string | null;
  connState: ConnectionState;
  hasChatOpen: boolean;
  hasOnlineAgent: boolean;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onOpenCmd: () => void;
}

export function Sidebar({
  sessions,
  activeSessionId,
  connState,
  hasChatOpen,
  hasOnlineAgent,
  onSelectChat,
  onNewChat,
  onOpenCmd,
}: SidebarProps) {
  const { theme, toggle } = useTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div
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
              onClick={onOpenCmd}
              className="text-[12px] px-3 py-1.5 transition-colors font-mono text-muted border border-border rounded-[6px] hover:text-body"
            >
              ⌘K
            </button>
            <button
              type="button"
              onClick={toggle}
              className="text-[12px] px-2.5 py-1.5 transition-colors text-muted border border-border rounded-[6px] hover:text-body"
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <button
              type="button"
              onClick={onNewChat}
              className="text-[12px] font-medium px-3 py-1.5 transition-colors text-accent border border-accent-border rounded-[6px] bg-accent-soft hover:bg-accent/10"
            >
              + New
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap py-2 border-t border-border border-b">
          <span className="text-[11px] px-2.5 py-1 font-mono text-body">
            {sessions.length} conversation{sessions.length !== 1 ? "s" : ""}
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
        {connState === "connected" && sessions.length === 0 && (
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
        {sessions.map((session, rowIdx) => {
          const isActive = session.id === activeSessionId;
          const isHov = session.id === hoveredId;
          const isBusy = session.status === "streaming" || session.status === "waiting_for_tool";
          return (
            <div
              key={session.id}
              className="relative"
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <button
                type="button"
                onClick={() => onSelectChat(session.id)}
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
                    : "2px solid transparent",
                }}
              >
                <div className="flex items-center gap-0 px-5 py-3">
                  <span className="text-[10px] w-5 shrink-0 tabular-nums font-mono text-dim">
                    {String(sessions.length - rowIdx).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0 pl-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {isBusy && (
                          <div className="w-[6px] h-[6px] rounded-full shrink-0 animate-pulse bg-accent" />
                        )}
                        <span
                          className={`text-[14px] font-medium truncate ${isActive ? "text-foreground" : "text-body"}`}
                        >
                          {session.title}
                        </span>
                      </div>
                      <span className="text-[10px] shrink-0 ml-2 tabular-nums font-mono text-dim">
                        {isBusy
                          ? session.status === "waiting_for_tool"
                            ? "tools"
                            : "streaming"
                          : session.messageCount > 0
                            ? `${session.messageCount} msg`
                            : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConnectionIndicator({ state }: { state: ConnectionState }) {
  const dotColors: Record<ConnectionState, string> = {
    connecting: "#fbbf24",
    connected: "#34d399",
    disconnected: "var(--dim)",
    error: "#ef4444",
  };
  const labels: Record<ConnectionState, string> = {
    connecting: "connecting",
    connected: "connected",
    disconnected: "disconnected",
    error: "connection error",
  };
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`w-[5px] h-[5px] rounded-full ${state === "connecting" ? "animate-pulse" : ""}`}
        style={{ background: dotColors[state] }}
      />
      <span className="text-[11px] font-mono text-muted">
        {labels[state]}
      </span>
    </span>
  );
}
