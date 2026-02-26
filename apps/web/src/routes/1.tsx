import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { PROJECTS, statusDot, type Convo, type Status, type Project } from "../lib/design-data";
import { useRelayState, usePaneInput, type CmdResult } from "../lib/design-logic";

export const Route = createFileRoute("/1")({
  component: DesignStoff,
});

const palette = {
  dark: {
    bg: "#111111",
    surface: "#191919",
    surfaceHover: "rgba(255,255,255,0.025)",
    surfaceActive: "rgba(255,255,255,0.05)",
    border: "#282828",
    borderSubtle: "#1E1E1E",
    text: "#e0e0e0",
    body: "#aaaaaa",
    muted: "#666666",
    dim: "#444444",
    ghost: "#282828",
    accent: "#5ba5f5",
    accentSoft: "rgba(91,165,245,0.08)",
    accentBorder: "rgba(91,165,245,0.2)",
    dangerText: "#f87171",
    dangerSoft: "rgba(248,113,113,0.06)",
    questionBg: "rgba(251,191,36,0.04)",
    questionBorder: "rgba(251,191,36,0.12)",
    questionText: "#fbbf24",
    overlay: "rgba(0,0,0,0.7)",
    cmdBg: "#161616",
  },
  light: {
    bg: "#fafafa",
    surface: "#ffffff",
    surfaceHover: "rgba(0,0,0,0.02)",
    surfaceActive: "rgba(0,0,0,0.04)",
    border: "#e2e2e2",
    borderSubtle: "#f0f0f0",
    text: "#1a1a1a",
    body: "#555555",
    muted: "#888888",
    dim: "#bbbbbb",
    ghost: "#e2e2e2",
    accent: "#2563eb",
    accentSoft: "rgba(37,99,235,0.06)",
    accentBorder: "rgba(37,99,235,0.2)",
    dangerText: "#dc2626",
    dangerSoft: "rgba(220,38,38,0.06)",
    questionBg: "rgba(245,158,11,0.05)",
    questionBorder: "rgba(245,158,11,0.15)",
    questionText: "#b45309",
    overlay: "rgba(0,0,0,0.25)",
    cmdBg: "#ffffff",
  },
};

type P = typeof palette.dark;
const sans = "'Figtree', -apple-system, system-ui, sans-serif";
const mono = "'JetBrains Mono', ui-monospace, monospace";

function DesignStoff() {
  const s = useRelayState();
  const p = s.mode === "dark" ? palette.dark : palette.light;

  return (
    <div className="flex h-screen overflow-hidden select-none" style={{ fontFamily: sans, background: p.bg, color: p.text }}>
      <ListPanel s={s} p={p} />
      <div className="flex-1 flex min-w-0">
        {s.openPanes.length === 0 && <EmptyState p={p} />}
        {s.openPanes.map((id, idx) => {
          const convo = s.convos.find((c) => c.id === id);
          if (!convo) return null;
          return (
            <ChatPane key={id} p={p} convo={convo} isFirst={idx === 0}
              onClose={() => s.closePane(id)} onSend={(text) => s.sendMessage(id, text)}
              onArchive={() => s.archiveConvo(id)} onAnswer={(a) => s.answerQuestion(id, a)} />
          );
        })}
      </div>
      {s.showCmd && <CmdPalette s={s} p={p} />}
      {s.terminalProject && <Terminal p={p} project={s.terminalProject} onClose={() => s.toggleTerminal(s.terminalProject!)} />}
      {s.notifications.length > 0 && s.openPanes.length === 0 && (
        <div className="fixed right-5 bottom-5 flex flex-col gap-3 z-40" style={{ maxWidth: "380px" }}>
          {s.notifications.map((nId) => {
            const c = s.convos.find((x) => x.id === nId);
            if (!c) return null;
            return (<FloatingQ key={nId} p={p} convo={c} onAnswer={(a) => s.answerQuestion(nId, a)}
              onOpen={() => { s.selectConvo(nId); s.setNotifications((prev) => prev.filter((x) => x !== nId)); }} />);
          })}
        </div>
      )}
    </div>
  );
}

function ListPanel({ s, p }: { s: ReturnType<typeof useRelayState>; p: P }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newProjectName, setNewProjectName] = useState(PROJECTS[0].name);
  const [customProject, setCustomProject] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const hasPanes = s.openPanes.length > 0;

  function submitNew() {
    if (!newTitle.trim()) return;
    let proj: Project;
    if (showCustom && customProject.trim()) {
      const colors = ["#5ba5f5", "#f87171", "#34d399", "#fbbf24", "#a78bfa"];
      proj = { name: customProject.trim(), color: colors[Math.floor(Math.random() * colors.length)] };
    } else { proj = PROJECTS.find((pr) => pr.name === newProjectName) || PROJECTS[0]; }
    s.createConvo(newTitle.trim(), proj);
    setNewTitle(""); setCustomProject(""); setShowCustom(false);
  }

  return (
    <div className="flex flex-col shrink-0 transition-all duration-300"
      style={{ width: hasPanes ? "380px" : "100%", maxWidth: hasPanes ? "380px" : "none", borderRight: hasPanes ? `1px solid ${p.border}` : "none" }}>
      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h1 className="text-[32px] font-bold leading-none tracking-[-0.03em]" style={{ color: p.text }}>
              {s.showArchived ? "Archive" : "Relay"}
            </h1>
            <div className="flex items-center gap-3 mt-1.5">
              {s.thinkingCount > 0 && !s.showArchived && (
                <span className="text-[12px] animate-pulse" style={{ color: p.body, fontFamily: mono }}>{s.thinkingCount} thinking</span>
              )}
              {s.waitingCount > 0 && !s.showArchived && (
                <span className="text-[12px]" style={{ color: p.muted, fontFamily: mono }}>{s.waitingCount} waiting</span>
              )}
              {s.questionCount > 0 && !s.showArchived && (
                <span className="text-[12px]" style={{ color: p.questionText, fontFamily: mono }}>{s.questionCount} question{s.questionCount > 1 ? "s" : ""}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={s.openCmd}
              className="text-[12px] px-3 py-1.5 transition-colors"
              style={{ color: p.muted, border: `1px solid ${p.border}`, borderRadius: "6px", fontFamily: mono }}>⌘K</button>
            <button type="button" onClick={s.toggleTheme}
              className="text-[12px] px-2.5 py-1.5 transition-colors"
              style={{ color: p.muted, border: `1px solid ${p.border}`, borderRadius: "6px" }}>
              {s.mode === "dark" ? "☀" : "☾"}
            </button>
            {!s.showArchived && (
              <button type="button" onClick={() => s.setShowNewForm(!s.showNewForm)}
                className="text-[12px] font-medium px-3 py-1.5 transition-colors"
                style={{ color: p.accent, border: `1px solid ${p.accentBorder}`, borderRadius: "6px", background: p.accentSoft }}>
                + New
              </button>
            )}
          </div>
        </div>

        {s.showNewForm && !s.showArchived && (
          <div className="mb-4 animate-fade-up" style={{ borderLeft: `2px solid ${p.accent}`, padding: "12px 16px", background: p.surface, borderRadius: "0 6px 6px 0" }}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitNew(); if (e.key === "Escape") s.setShowNewForm(false); }}
              placeholder="Thread name..."
              className="w-full text-[15px] font-medium bg-transparent focus:outline-none mb-3"
              style={{ color: p.text }} autoFocus />
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {PROJECTS.map((pr) => (
                <button key={pr.name} type="button" onClick={() => { setNewProjectName(pr.name); setShowCustom(false); }}
                  className="text-[11px] px-2.5 py-1 transition-colors"
                  style={{
                    color: !showCustom && newProjectName === pr.name ? pr.color : p.muted,
                    background: !showCustom && newProjectName === pr.name ? `${pr.color}12` : "transparent",
                    border: !showCustom && newProjectName === pr.name ? `1px solid ${pr.color}30` : `1px solid ${p.border}`,
                    borderRadius: "4px", fontFamily: mono,
                  }}>{pr.name}</button>
              ))}
              <button type="button" onClick={() => setShowCustom(!showCustom)}
                className="text-[11px] px-2.5 py-1 transition-colors"
                style={{ color: showCustom ? p.accent : p.muted, border: `1px solid ${showCustom ? p.accentBorder : p.border}`, borderRadius: "4px", fontFamily: mono }}>
                + project
              </button>
            </div>
            {showCustom && (
              <input value={customProject} onChange={(e) => setCustomProject(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitNew(); }}
                placeholder="Project name..."
                className="w-full text-[12px] bg-transparent focus:outline-none mb-2 pb-1.5"
                style={{ color: p.text, borderBottom: `1px solid ${p.border}`, fontFamily: mono }} autoFocus />
            )}
            <div className="flex justify-end mt-1">
              <button type="button" onClick={submitNew} disabled={!newTitle.trim()}
                className="text-[12px] font-medium px-3 py-1 transition-all disabled:opacity-20"
                style={{ color: p.accent }}>
                Create →
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 flex-wrap py-2" style={{ borderTop: `1px solid ${p.border}`, borderBottom: `1px solid ${p.border}` }}>
          <button type="button" onClick={() => { s.setShowArchived(false); s.setFilterProject(null); }}
            className="text-[11px] px-2.5 py-1 transition-colors"
            style={{ color: !s.filterProject && !s.showArchived ? p.text : p.muted, background: !s.filterProject && !s.showArchived ? p.surfaceActive : "transparent", borderRadius: "4px", fontFamily: mono }}>
            all
          </button>
          {PROJECTS.map((pr) => (
            <button key={pr.name} type="button"
              onClick={() => { s.setShowArchived(false); s.setFilterProject(s.filterProject === pr.name ? null : pr.name); }}
              className="text-[11px] px-2.5 py-1 transition-colors flex items-center gap-1.5"
              style={{ color: s.filterProject === pr.name ? pr.color : p.muted, background: s.filterProject === pr.name ? `${pr.color}10` : "transparent", borderRadius: "4px", fontFamily: mono }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: pr.color, opacity: s.filterProject === pr.name ? 1 : 0.3 }} />
              {pr.name}
            </button>
          ))}
          <span className="text-[11px] mx-1" style={{ color: p.ghost }}>·</span>
          {(["thinking", "waiting", "error"] as Status[]).map((st) => {
            const dot = statusDot(st);
            return (
              <button key={st} type="button" onClick={() => s.setFilterStatus(s.filterStatus === st ? null : st)}
                className="text-[11px] px-2.5 py-1 transition-colors flex items-center gap-1.5"
                style={{ color: s.filterStatus === st ? p.body : p.ghost, borderRadius: "4px", fontFamily: mono }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.filterStatus === st ? dot.bg : p.ghost }} />
                {st}
              </button>
            );
          })}
          <span className="text-[11px] mx-1" style={{ color: p.ghost }}>·</span>
          <button type="button" onClick={() => { s.setShowArchived(!s.showArchived); s.setFilterProject(null); s.setFilterStatus(null); }}
            className="text-[11px] px-2.5 py-1 transition-colors"
            style={{ color: s.showArchived ? p.body : p.ghost, borderRadius: "4px", fontFamily: mono }}>
            archived
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {s.filtered.map((c, rowIdx) => {
          const isOpen = s.openPanes.includes(c.id);
          const isHov = c.id === hoveredId;
          const isDO = c.id === s.dragOverId;
          const dot = statusDot(c.status);
          return (
            <div key={c.id} className="relative" draggable={!s.showArchived}
              onDragStart={() => s.handleDragStart(c.id)} onDragOver={(e) => s.handleDragOver(e, c.id)}
              onDrop={() => s.handleDrop(c.id)} onDragEnd={() => {}}
              onMouseEnter={() => setHoveredId(c.id)} onMouseLeave={() => setHoveredId(null)}>
              {isDO && <div className="absolute top-0 left-5 right-5 h-[2px] rounded-full" style={{ background: p.accent }} />}
              <button type="button" onClick={() => s.selectConvo(c.id)}
                className="w-full text-left transition-all duration-150"
                style={{
                  background: isOpen ? p.surfaceActive : isHov ? p.surfaceHover : "transparent",
                  borderBottom: `1px solid ${p.borderSubtle}`,
                  borderLeft: isOpen ? `2px solid ${p.accent}` : "2px solid transparent",
                }}>
                <div className="flex items-center gap-0 px-5 py-3">
                  <span className="text-[10px] w-5 shrink-0 tabular-nums" style={{ color: p.dim, fontFamily: mono }}>
                    {String(rowIdx + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0 pl-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-[6px] h-[6px] rounded-full shrink-0 ${dot.cls}`} style={{ background: dot.bg }} />
                        <span className="text-[14px] font-medium truncate" style={{ color: isOpen ? p.text : p.body }}>
                          {c.title}
                        </span>
                        {c.hasQuestion && (
                          <span className="text-[9px] px-1.5 py-0.5 shrink-0 font-medium" style={{ color: p.questionText, background: p.questionBg, borderRadius: "3px", fontFamily: mono }}>?</span>
                        )}
                      </div>
                      <span className="text-[10px] shrink-0 ml-2 tabular-nums" style={{ color: p.dim, fontFamily: mono }}>{c.time}</span>
                    </div>
                    <div className="flex items-center gap-2 pl-[18px]">
                      <span className="text-[10px] px-1.5 py-0.5 shrink-0"
                        style={{ color: c.project.color, background: `${c.project.color}10`, borderRadius: "3px", fontFamily: mono }}>{c.project.name}</span>
                      <span className="text-[12px] truncate" style={{ color: p.muted }}>{c.lastMessage}</span>
                    </div>
                  </div>
                </div>
              </button>
              {isHov && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 animate-fade-in">
                  {s.showArchived ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); s.unarchiveConvo(c.id); }}
                      className="text-[11px] px-2.5 py-1 transition-colors"
                      style={{ color: p.body, background: p.surface, border: `1px solid ${p.border}`, borderRadius: "4px", fontFamily: mono }}>restore</button>
                  ) : (
                    <>
                      <button type="button" onClick={(e) => { e.stopPropagation(); s.toggleTerminal(c.project.name); }}
                        className="text-[11px] px-2.5 py-1 transition-colors"
                        style={{ color: p.body, background: p.surface, border: `1px solid ${p.border}`, borderRadius: "4px", fontFamily: mono }}>term</button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); s.archiveConvo(c.id); }}
                        className="text-[11px] px-2.5 py-1 transition-colors"
                        style={{ color: p.body, background: p.surface, border: `1px solid ${p.border}`, borderRadius: "4px", fontFamily: mono }}>archive</button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {s.filtered.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-[13px]" style={{ color: p.muted }}>{s.showArchived ? "No archived conversations" : "No conversations match"}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ p }: { p: P }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center animate-fade-in">
        <p className="text-[13px] mb-3" style={{ color: p.muted }}>Select a conversation or</p>
        <kbd className="text-[12px] px-3 py-1.5 inline-block"
          style={{ color: p.body, background: p.surface, border: `1px solid ${p.border}`, borderRadius: "6px", fontFamily: mono }}>
          ⌘K
        </kbd>
      </div>
    </div>
  );
}

function ChatPane({ p, convo, isFirst, onClose, onSend, onArchive, onAnswer }: {
  p: P; convo: Convo; isFirst: boolean;
  onClose: () => void; onSend: (t: string) => void; onArchive: () => void; onAnswer: (a: string) => void;
}) {
  const { input, setInput, queued, inputRef, isThinking, send } = usePaneInput(convo.status, onSend);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
  }, [convo.messages.length]);
  const dot = statusDot(convo.status);

  return (
    <div className="flex flex-col min-w-0 animate-slide-in-right" style={{ flex: 1, borderLeft: !isFirst ? `1px solid ${p.border}` : "none" }}>
      <div className="flex items-center justify-between px-5 h-12 shrink-0" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-[6px] h-[6px] rounded-full shrink-0 ${dot.cls}`} style={{ background: dot.bg }} />
          <span className="text-[15px] font-medium truncate" style={{ color: p.text }}>{convo.title}</span>
          <span className="text-[10px] px-1.5 py-0.5 shrink-0"
            style={{ color: convo.project.color, background: `${convo.project.color}10`, borderRadius: "3px", fontFamily: mono }}>{convo.project.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onArchive} className="text-[11px] px-2 py-1 transition-colors" style={{ color: p.muted, fontFamily: mono }}>archive</button>
          <button type="button" onClick={onClose} className="text-[13px] w-6 h-6 flex items-center justify-center transition-colors" style={{ color: p.muted, borderRadius: "4px" }}>×</button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-[620px] mx-auto px-6 py-6">
          {convo.messages.map((msg, i) => (
            <div key={msg.id} className="mb-6"
              style={{ animation: i === convo.messages.length - 1 ? "fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both" : "none" }}>
              {msg.role === "user" ? (
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-[9px]" style={{ background: p.muted }} />
                  <p className="text-[14px] leading-[1.75]" style={{ color: p.body }}>{msg.content}</p>
                </div>
              ) : (
                <div className="pl-[18px]" style={{ borderLeft: `2px solid ${p.borderSubtle}` }}>
                  <p className="text-[14px] leading-[1.85] pl-4" style={{ color: p.text }}>{msg.content}</p>
                </div>
              )}
            </div>
          ))}

          {convo.hasQuestion && convo.questionText && (
            <div className="mb-6 ml-[18px] p-4 animate-scale-in"
              style={{ background: p.questionBg, border: `1px solid ${p.questionBorder}`, borderRadius: "6px" }}>
              <p className="text-[13px] mb-3 leading-[1.7]" style={{ color: p.questionText }}>{convo.questionText}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {convo.questionOptions?.map((opt) => (
                  <button key={opt} type="button" onClick={() => onAnswer(opt)}
                    className="text-[12px] px-3 py-1.5 transition-all"
                    style={{ color: p.questionText, border: `1px solid ${p.questionBorder}`, borderRadius: "4px", background: "transparent", fontFamily: mono }}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isThinking && (
            <div className="pl-[18px] animate-fade-in">
              <div className="flex gap-1.5 items-center pl-4">
                <div className="w-1 h-1 rounded-full animate-bounce" style={{ background: p.muted, animationDelay: "0ms" }} />
                <div className="w-1 h-1 rounded-full animate-bounce" style={{ background: p.muted, animationDelay: "150ms" }} />
                <div className="w-1 h-1 rounded-full animate-bounce" style={{ background: p.muted, animationDelay: "300ms" }} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-5 py-3" style={{ borderTop: `1px solid ${p.border}` }}>
        <div className="max-w-[620px] mx-auto">
          {queued.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px]" style={{ color: p.muted, fontFamily: mono }}>{queued.length} queued</span>
              <div className="flex-1 h-px" style={{ background: p.border }} />
            </div>
          )}
          <div className="flex items-end gap-2"
            style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: "8px", padding: "10px 14px" }}>
            <textarea ref={inputRef} value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={isThinking ? "Message will be queued..." : "Message..."}
              rows={1} className="flex-1 text-[14px] focus:outline-none resize-none bg-transparent"
              style={{ color: p.text, caretColor: p.accent }} />
            <div className="flex items-center gap-1.5 shrink-0 pb-0.5">
              {input.trim() && <span className="text-[10px] animate-fade-in" style={{ color: p.dim, fontFamily: mono }}>↵</span>}
              <button type="button" onClick={send} disabled={!input.trim()}
                className="transition-all disabled:opacity-15" style={{ color: p.accent }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[10px]" style={{ color: p.ghost, fontFamily: mono }}>shift+enter for new line</span>
            {isThinking && <span className="text-[10px] animate-pulse-soft" style={{ color: p.muted, fontFamily: mono }}>thinking...</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CmdPalette({ s, p }: { s: ReturnType<typeof useRelayState>; p: P }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [s.cmdQuery]);
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, s.cmdResults.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && s.cmdResults[idx]) {
      e.preventDefault(); const r = s.cmdResults[idx];
      if (r.type === "chat") { s.selectConvo(r.convo.id); s.closeCmd(); }
      else if (r.type === "project") { s.setFilterProject(r.project.name); s.closeCmd(); }
      else if (r.type === "action") { r.action(); s.closeCmd(); }
    } else if (e.key === "Escape") s.closeCmd();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh]" style={{ background: p.overlay }} onClick={s.closeCmd}>
      <div className="w-full max-w-[540px] animate-spotlight-in overflow-hidden"
        style={{ background: p.cmdBg, border: `1px solid ${p.border}`, borderRadius: "10px", boxShadow: "0 25px 60px rgba(0,0,0,0.4)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${p.border}` }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: p.muted, flexShrink: 0 }}>
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input ref={s.cmdInputRef} value={s.cmdQuery} onChange={(e) => s.setCmdQuery(e.target.value)} onKeyDown={onKey}
            placeholder="Search conversations, projects, actions..."
            className="flex-1 text-[14px] bg-transparent focus:outline-none"
            style={{ color: p.text, caretColor: p.accent }} />
          <kbd className="text-[10px] px-1.5 py-0.5" style={{ color: p.muted, background: p.surfaceHover, borderRadius: "3px", fontFamily: mono }}>esc</kbd>
        </div>
        <div className="max-h-[380px] overflow-y-auto py-1">
          {s.cmdResults.length === 0 && <div className="px-4 py-8 text-center"><p className="text-[13px]" style={{ color: p.muted }}>No results</p></div>}
          {s.cmdResults.map((r: CmdResult, i: number) => {
            const sel = i === idx;
            if (r.type === "chat") {
              const dot = statusDot(r.convo.status);
              return (
                <button key={`c-${r.convo.id}`} type="button" onClick={() => { s.selectConvo(r.convo.id); s.closeCmd(); }}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                  style={{ background: sel ? p.surfaceActive : "transparent", borderLeft: sel ? `2px solid ${p.accent}` : "2px solid transparent" }}
                  onMouseEnter={() => setIdx(i)}>
                  <div className={`w-[5px] h-[5px] rounded-full shrink-0 ${dot.cls}`} style={{ background: dot.bg }} />
                  <span className="text-[14px] truncate flex-1" style={{ color: p.body }}>{r.convo.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 shrink-0" style={{ color: r.convo.project.color, background: `${r.convo.project.color}10`, borderRadius: "3px", fontFamily: mono }}>{r.convo.project.name}</span>
                  {r.convo.archived && <span className="text-[10px]" style={{ color: p.dim, fontFamily: mono }}>archived</span>}
                </button>
              );
            }
            if (r.type === "project") {
              return (
                <button key={`p-${r.project.name}`} type="button" onClick={() => { s.setFilterProject(r.project.name); s.closeCmd(); }}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                  style={{ background: sel ? p.surfaceActive : "transparent", borderLeft: sel ? `2px solid ${p.accent}` : "2px solid transparent" }}
                  onMouseEnter={() => setIdx(i)}>
                  <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: r.project.color }} />
                  <span className="text-[14px]" style={{ color: p.body }}>{r.project.name}</span>
                  <span className="text-[10px]" style={{ color: p.muted, fontFamily: mono }}>project</span>
                </button>
              );
            }
            return (
              <button key={`a-${r.label}`} type="button" onClick={() => { r.action(); s.closeCmd(); }}
                className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                style={{ background: sel ? p.surfaceActive : "transparent", borderLeft: sel ? `2px solid ${p.accent}` : "2px solid transparent" }}
                onMouseEnter={() => setIdx(i)}>
                <span className="text-[12px]" style={{ color: p.accent }}>→</span>
                <span className="text-[14px]" style={{ color: p.body }}>{r.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Terminal({ p, project, onClose }: { p: P; project: string; onClose: () => void }) {
  const lines = [`$ cd ~/projects/${project}`, `$ git status`, `On branch main`, `Your branch is up to date with 'origin/main'.`,
    ``, `Changes not staged for commit:`, `  modified:   src/index.ts`, `  modified:   src/utils.ts`, ``, `$ █`];
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 animate-slide-up" style={{ height: "220px", borderTop: `1px solid ${p.border}` }}>
      <div className="h-full flex flex-col" style={{ background: p.bg }}>
        <div className="flex items-center justify-between px-5 h-9 shrink-0" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium" style={{ color: p.body, fontFamily: mono }}>terminal</span>
            <span className="text-[10px] px-1.5 py-0.5" style={{ color: p.muted, background: p.surfaceHover, borderRadius: "3px", fontFamily: mono }}>{project}</span>
          </div>
          <button type="button" onClick={onClose} className="text-[13px]" style={{ color: p.muted }}>×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {lines.map((line, i) => (
            <div key={i} className="text-[12px] leading-[1.8]" style={{ color: line.startsWith("$") ? p.body : p.muted, fontFamily: mono }}>{line || "\u00A0"}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FloatingQ({ p, convo, onAnswer, onOpen }: { p: P; convo: Convo; onAnswer: (a: string) => void; onOpen: () => void }) {
  const dot = statusDot(convo.status);
  return (
    <div className="animate-slide-in-right"
      style={{ background: p.surface, border: `1px solid ${p.questionBorder}`, borderRadius: "8px", padding: "14px 16px", boxShadow: "0 8px 30px rgba(0,0,0,0.25)" }}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-[5px] h-[5px] rounded-full ${dot.cls}`} style={{ background: dot.bg }} />
        <button type="button" onClick={onOpen} className="text-[13px] font-medium truncate" style={{ color: p.text }}>{convo.title}</button>
        <span className="text-[10px] px-1.5 py-0.5 shrink-0" style={{ color: convo.project.color, background: `${convo.project.color}10`, borderRadius: "3px", fontFamily: mono }}>{convo.project.name}</span>
      </div>
      <p className="text-[12px] leading-[1.7] mb-3" style={{ color: p.questionText }}>{convo.questionText}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {convo.questionOptions?.map((opt) => (
          <button key={opt} type="button" onClick={() => onAnswer(opt)}
            className="text-[11px] px-3 py-1 transition-all"
            style={{ color: p.questionText, border: `1px solid ${p.questionBorder}`, borderRadius: "4px", background: "transparent", fontFamily: mono }}>{opt}</button>
        ))}
      </div>
    </div>
  );
}
