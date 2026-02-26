import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { PROJECTS, statusDot, type Convo, type Status, type Project } from "../lib/design-data";
import { useRelayState, usePaneInput, type CmdResult } from "../lib/design-logic";

export const Route = createFileRoute("/4")({
  component: DesignSwissGrid,
});

const palette = {
  dark: {
    bg: "#0C0C0C",
    surface: "#141414",
    surfaceHover: "rgba(255,255,255,0.02)",
    surfaceActive: "rgba(255,255,255,0.05)",
    border: "#222222",
    borderSubtle: "#1A1A1A",
    text: "#E0E0E0",
    textSecondary: "#999999",
    textMuted: "#666666",
    textDim: "#444444",
    textGhost: "#2A2A2A",
    red: "#E53935",
    redSoft: "rgba(229,57,53,0.08)",
    questionBg: "rgba(229,57,53,0.04)",
    questionBorder: "rgba(229,57,53,0.2)",
    questionText: "#EF5350",
    overlay: "rgba(0,0,0,0.75)",
    cmdBg: "#141414",
  },
  light: {
    bg: "#F5F5F5",
    surface: "#FFFFFF",
    surfaceHover: "rgba(0,0,0,0.02)",
    surfaceActive: "rgba(0,0,0,0.04)",
    border: "#CCCCCC",
    borderSubtle: "#E5E5E5",
    text: "#111111",
    textSecondary: "#555555",
    textMuted: "#888888",
    textDim: "#AAAAAA",
    textGhost: "#DDDDDD",
    red: "#D32F2F",
    redSoft: "rgba(211,47,47,0.06)",
    questionBg: "rgba(211,47,47,0.04)",
    questionBorder: "rgba(211,47,47,0.2)",
    questionText: "#C62828",
    overlay: "rgba(0,0,0,0.3)",
    cmdBg: "#FFFFFF",
  },
};

type P = typeof palette.dark;
const heading = "'Anybody', sans-serif";
const mono = "'Space Mono', monospace";

function DesignSwissGrid() {
  const s = useRelayState();
  const p = s.mode === "dark" ? palette.dark : palette.light;

  return (
    <div className="flex h-screen overflow-hidden select-none" style={{ fontFamily: mono, fontSize: "12px", background: p.bg, color: p.text }}>
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
        <div className="fixed right-0 bottom-0 flex flex-col z-40" style={{ maxWidth: "400px" }}>
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
      const colors = ["#E53935", "#1E88E5", "#43A047", "#FB8C00", "#8E24AA"];
      proj = { name: customProject.trim(), color: colors[Math.floor(Math.random() * colors.length)] };
    } else { proj = PROJECTS.find((pr) => pr.name === newProjectName) || PROJECTS[0]; }
    s.createConvo(newTitle.trim(), proj);
    setNewTitle(""); setCustomProject(""); setShowCustom(false);
  }

  return (
    <div className="flex flex-col shrink-0 transition-all duration-300"
      style={{ width: hasPanes ? "380px" : "100%", maxWidth: hasPanes ? "380px" : "none", borderRight: hasPanes ? `2px solid ${p.border}` : "none" }}>
      <div className="px-6 pt-6 pb-4 shrink-0">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h1 className="text-[48px] font-black leading-none tracking-[-0.04em] uppercase" style={{ fontFamily: heading, color: p.text }}>
              {s.showArchived ? "ARC" : "RLY"}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              {s.thinkingCount > 0 && !s.showArchived && <span className="text-[10px] animate-pulse" style={{ color: p.textMuted }}>{s.thinkingCount}T</span>}
              {s.waitingCount > 0 && !s.showArchived && <span className="text-[10px]" style={{ color: p.textDim }}>{s.waitingCount}W</span>}
              {s.questionCount > 0 && !s.showArchived && <span className="text-[10px]" style={{ color: p.red }}>{s.questionCount}Q</span>}
            </div>
          </div>
          <div className="flex items-center gap-0">
            <button type="button" onClick={s.openCmd}
              className="text-[10px] px-3 py-2 transition-colors border-l border-t border-b"
              style={{ color: p.textMuted, borderColor: p.border }}>⌘K</button>
            <button type="button" onClick={s.toggleTheme}
              className="text-[10px] px-3 py-2 transition-colors border-l border-t border-b"
              style={{ color: p.textMuted, borderColor: p.border }}>{s.mode === "dark" ? "LT" : "DK"}</button>
            {!s.showArchived && (
              <button type="button" onClick={() => s.setShowNewForm(!s.showNewForm)}
                className="text-[10px] px-3 py-2 transition-colors border"
                style={{ color: p.red, borderColor: p.border, background: p.redSoft }}>NEW</button>
            )}
          </div>
        </div>

        {s.showNewForm && !s.showArchived && (
          <div className="mb-4 animate-fade-up" style={{ borderTop: `2px solid ${p.red}`, background: p.surface, padding: "16px" }}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitNew(); if (e.key === "Escape") s.setShowNewForm(false); }}
              placeholder="THREAD TITLE"
              className="w-full text-[14px] font-black uppercase tracking-tight bg-transparent focus:outline-none mb-3"
              style={{ color: p.text, fontFamily: heading }} autoFocus />
            <div className="grid grid-cols-4 gap-0 mb-3">
              {PROJECTS.map((pr) => (
                <button key={pr.name} type="button" onClick={() => { setNewProjectName(pr.name); setShowCustom(false); }}
                  className="text-[10px] py-1.5 transition-colors text-center border"
                  style={{
                    color: !showCustom && newProjectName === pr.name ? "#fff" : p.textDim,
                    background: !showCustom && newProjectName === pr.name ? pr.color : "transparent",
                    borderColor: p.border,
                  }}>{pr.name}</button>
              ))}
              <button type="button" onClick={() => setShowCustom(!showCustom)}
                className="text-[10px] py-1.5 transition-colors text-center border"
                style={{ color: showCustom ? p.red : p.textDim, borderColor: p.border, background: showCustom ? p.redSoft : "transparent" }}>+PRJ</button>
            </div>
            {showCustom && (
              <input value={customProject} onChange={(e) => setCustomProject(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitNew(); }}
                placeholder="project name" className="w-full text-[10px] bg-transparent focus:outline-none mb-3 pb-1"
                style={{ color: p.text, borderBottom: `1px solid ${p.border}` }} autoFocus />
            )}
            <button type="button" onClick={submitNew} disabled={!newTitle.trim()}
              className="text-[10px] w-full py-2 transition-all disabled:opacity-20"
              style={{ color: "#fff", background: p.red }}>CREATE</button>
          </div>
        )}

        <div className="grid grid-cols-8 gap-0" style={{ border: `1px solid ${p.border}` }}>
          <button type="button" onClick={() => { s.setShowArchived(false); s.setFilterProject(null); }}
            className="text-[9px] py-1.5 text-center transition-colors col-span-1"
            style={{ color: !s.filterProject && !s.showArchived ? p.text : p.textGhost, background: !s.filterProject && !s.showArchived ? p.surfaceActive : "transparent", borderRight: `1px solid ${p.border}` }}>ALL</button>
          {PROJECTS.map((pr) => (
            <button key={pr.name} type="button"
              onClick={() => { s.setShowArchived(false); s.setFilterProject(s.filterProject === pr.name ? null : pr.name); }}
              className="text-[9px] py-1.5 text-center transition-colors"
              style={{ color: s.filterProject === pr.name ? pr.color : p.textGhost, background: s.filterProject === pr.name ? `${pr.color}10` : "transparent", borderRight: `1px solid ${p.border}` }}>
              {pr.name.slice(0, 4).toUpperCase()}
            </button>
          ))}
          {(["thinking", "waiting", "error"] as Status[]).map((st) => (
            <button key={st} type="button" onClick={() => s.setFilterStatus(s.filterStatus === st ? null : st)}
              className="text-[9px] py-1.5 text-center transition-colors"
              style={{ color: s.filterStatus === st ? p.textSecondary : p.textGhost, borderRight: `1px solid ${p.border}` }}>
              {st.slice(0, 3).toUpperCase()}
            </button>
          ))}
          <button type="button" onClick={() => { s.setShowArchived(!s.showArchived); s.setFilterProject(null); s.setFilterStatus(null); }}
            className="text-[9px] py-1.5 text-center transition-colors"
            style={{ color: s.showArchived ? p.textSecondary : p.textGhost }}>ARC</button>
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
              {isDO && <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: p.red }} />}
              <button type="button" onClick={() => s.selectConvo(c.id)}
                className="w-full text-left transition-all duration-100"
                style={{
                  background: isOpen ? p.surfaceActive : isHov ? p.surfaceHover : "transparent",
                  borderBottom: `1px solid ${p.border}`,
                  borderLeft: isOpen ? `3px solid ${p.red}` : "3px solid transparent",
                }}>
                <div className="grid items-center gap-0 px-6 py-2.5" style={{ gridTemplateColumns: "auto 1fr auto auto" }}>
                  <span className="text-[9px] w-6 shrink-0" style={{ color: p.textGhost }}>{String(rowIdx + 1).padStart(2, "0")}</span>
                  <div className="flex items-center gap-2 min-w-0 px-2">
                    <div className={`w-[5px] h-[5px] shrink-0 ${dot.cls}`} style={{ background: dot.bg }} />
                    <span className="text-[13px] font-bold uppercase tracking-[-0.01em] truncate" style={{ fontFamily: heading, color: isOpen ? p.text : p.textSecondary }}>
                      {c.title}
                    </span>
                    {c.hasQuestion && <span className="w-1.5 h-1.5 shrink-0" style={{ background: p.red }} />}
                  </div>
                  <span className="text-[9px] shrink-0 px-2 py-0.5 text-center" style={{ color: c.project.color, background: `${c.project.color}08`, minWidth: "48px" }}>{c.project.name}</span>
                  <span className="text-[9px] shrink-0 w-8 text-right" style={{ color: p.textDim }}>{c.time}</span>
                </div>
                <div className="px-6 pb-2">
                  <p className="text-[10px] truncate pl-6" style={{ color: p.textDim }}>{c.lastMessage}</p>
                </div>
              </button>
              {isHov && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-0 animate-fade-in">
                  {s.showArchived ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); s.unarchiveConvo(c.id); }}
                      className="text-[9px] px-2 py-1 border" style={{ color: p.textMuted, borderColor: p.border, background: p.surface }}>RST</button>
                  ) : (
                    <>
                      <button type="button" onClick={(e) => { e.stopPropagation(); s.toggleTerminal(c.project.name); }}
                        className="text-[9px] px-2 py-1 border-l border-t border-b" style={{ color: p.textMuted, borderColor: p.border, background: p.surface }}>TRM</button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); s.archiveConvo(c.id); }}
                        className="text-[9px] px-2 py-1 border" style={{ color: p.textMuted, borderColor: p.border, background: p.surface }}>ARC</button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {s.filtered.length === 0 && (
          <div className="py-20 text-center"><p className="text-[11px] uppercase" style={{ color: p.textDim }}>EMPTY</p></div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ p }: { p: P }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center animate-fade-in">
        <p className="text-[96px] font-black leading-none tracking-[-0.06em] uppercase" style={{ fontFamily: heading, color: p.textGhost }}>
          ∅
        </p>
        <p className="text-[10px] uppercase mt-4 tracking-wider" style={{ color: p.textDim }}>SELECT A THREAD</p>
        <p className="text-[10px] uppercase mt-1 tracking-wider" style={{ color: p.textGhost }}>OR ⌘K</p>
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
    <div className="flex flex-col min-w-0 animate-slide-in-right" style={{ flex: 1, borderLeft: !isFirst ? `2px solid ${p.border}` : "none" }}>
      <div className="flex items-center justify-between px-6 h-12 shrink-0" style={{ borderBottom: `2px solid ${p.border}` }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-[5px] h-[5px] shrink-0 ${dot.cls}`} style={{ background: dot.bg }} />
          <span className="text-[15px] font-black uppercase tracking-[-0.01em] truncate" style={{ fontFamily: heading, color: p.text }}>{convo.title}</span>
          <span className="text-[9px] px-2 py-0.5 shrink-0" style={{ color: convo.project.color, background: `${convo.project.color}08` }}>{convo.project.name}</span>
        </div>
        <div className="flex items-center gap-0">
          <button type="button" onClick={onArchive} className="text-[9px] px-2 py-1 border-l border-t border-b" style={{ color: p.textDim, borderColor: p.border }}>ARC</button>
          <button type="button" onClick={onClose} className="text-[9px] px-2 py-1 border" style={{ color: p.textDim, borderColor: p.border }}>×</button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-[600px] mx-auto px-6 py-6">
          {convo.messages.map((msg, i) => (
            <div key={msg.id} className="mb-6" style={{ animation: i === convo.messages.length - 1 ? "fade-up 0.3s cubic-bezier(0.16,1,0.3,1) both" : "none" }}>
              {msg.role === "user" ? (
                <div className="flex items-start gap-3">
                  <span className="text-[9px] shrink-0 mt-[4px] px-1 py-0.5 font-bold" style={{ fontFamily: heading, color: p.red, background: p.redSoft }}>U</span>
                  <p className="text-[12px] leading-[1.8]" style={{ color: p.textSecondary }}>{msg.content}</p>
                </div>
              ) : (
                <div className="pl-[24px]" style={{ borderLeft: `2px solid ${p.border}` }}>
                  <p className="text-[12px] leading-[2] pl-3" style={{ color: p.text }}>{msg.content}</p>
                </div>
              )}
            </div>
          ))}
          {convo.hasQuestion && convo.questionText && (
            <div className="mb-6 ml-[24px] animate-scale-in" style={{ borderTop: `2px solid ${p.red}`, background: p.questionBg, padding: "12px" }}>
              <p className="text-[11px] mb-3 leading-relaxed" style={{ color: p.questionText }}>{convo.questionText}</p>
              <div className="grid grid-cols-3 gap-0">
                {convo.questionOptions?.map((opt) => (
                  <button key={opt} type="button" onClick={() => onAnswer(opt)}
                    className="text-[10px] py-1.5 text-center transition-all border"
                    style={{ color: p.red, borderColor: p.questionBorder, background: "transparent" }}>{opt}</button>
                ))}
              </div>
            </div>
          )}
          {isThinking && (
            <div className="pl-[24px] animate-fade-in">
              <div className="h-[2px] w-24 animate-shimmer" style={{ background: `linear-gradient(90deg, transparent, ${p.red}, transparent)` }} />
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-6 py-3" style={{ borderTop: `2px solid ${p.border}` }}>
        <div className="max-w-[600px] mx-auto">
          {queued.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px]" style={{ color: p.textDim }}>{queued.length} QUEUED</span>
              <div className="flex-1 h-px" style={{ background: p.border }} />
            </div>
          )}
          <div className="flex items-end gap-0" style={{ border: `1px solid ${p.border}` }}>
            <div className="flex items-center px-2 py-2 shrink-0" style={{ borderRight: `1px solid ${p.border}`, background: p.surfaceHover }}>
              <span className="text-[9px]" style={{ color: p.red }}>{">"}</span>
            </div>
            <textarea ref={inputRef} value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={isThinking ? "QUEUING..." : "INPUT"}
              rows={1} className="flex-1 text-[12px] focus:outline-none resize-none bg-transparent px-3 py-2"
              style={{ color: p.text, caretColor: p.red }} />
            <button type="button" onClick={send} disabled={!input.trim()}
              className="text-[9px] font-bold px-4 py-2 transition-all disabled:opacity-15 shrink-0"
              style={{ color: "#fff", background: p.red, fontFamily: heading }}>SEND</button>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[9px]" style={{ color: p.textGhost }}>SHIFT+RET=NEWLINE</span>
            {isThinking && <span className="text-[9px] animate-pulse-soft" style={{ color: p.red }}>PROCESSING</span>}
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" style={{ background: p.overlay }} onClick={s.closeCmd}>
      <div className="w-full max-w-[540px] animate-spotlight-in overflow-hidden"
        style={{ background: p.cmdBg, border: `2px solid ${p.border}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-0" style={{ borderBottom: `2px solid ${p.border}` }}>
          <div className="px-3 py-3 shrink-0" style={{ borderRight: `1px solid ${p.border}` }}>
            <span className="text-[10px]" style={{ color: p.red }}>⌕</span>
          </div>
          <input ref={s.cmdInputRef} value={s.cmdQuery} onChange={(e) => s.setCmdQuery(e.target.value)} onKeyDown={onKey}
            placeholder="SEARCH" className="flex-1 text-[12px] bg-transparent focus:outline-none px-3 py-3 uppercase tracking-wider"
            style={{ color: p.text, caretColor: p.red, fontFamily: heading, fontWeight: 700 }} />
          <div className="px-3 py-3 shrink-0" style={{ borderLeft: `1px solid ${p.border}` }}>
            <span className="text-[9px]" style={{ color: p.textGhost }}>ESC</span>
          </div>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {s.cmdResults.length === 0 && <div className="px-4 py-8 text-center"><p className="text-[10px] uppercase" style={{ color: p.textDim }}>NO RESULTS</p></div>}
          {s.cmdResults.map((r: CmdResult, i: number) => {
            const sel = i === idx;
            if (r.type === "chat") {
              const dot = statusDot(r.convo.status);
              return (
                <button key={`c-${r.convo.id}`} type="button" onClick={() => { s.selectConvo(r.convo.id); s.closeCmd(); }}
                  className="w-full text-left px-4 py-2 flex items-center gap-3 transition-colors"
                  style={{ background: sel ? p.surfaceActive : "transparent", borderBottom: `1px solid ${p.borderSubtle}`, borderLeft: sel ? `3px solid ${p.red}` : "3px solid transparent" }}
                  onMouseEnter={() => setIdx(i)}>
                  <div className={`w-[5px] h-[5px] shrink-0 ${dot.cls}`} style={{ background: dot.bg }} />
                  <span className="text-[11px] font-bold uppercase tracking-tight truncate flex-1" style={{ fontFamily: heading, color: p.textSecondary }}>{r.convo.title}</span>
                  <span className="text-[9px] px-1 py-0.5 shrink-0" style={{ color: r.convo.project.color, background: `${r.convo.project.color}08` }}>{r.convo.project.name}</span>
                </button>
              );
            }
            if (r.type === "project") {
              return (
                <button key={`p-${r.project.name}`} type="button" onClick={() => { s.setFilterProject(r.project.name); s.closeCmd(); }}
                  className="w-full text-left px-4 py-2 flex items-center gap-3 transition-colors"
                  style={{ background: sel ? p.surfaceActive : "transparent", borderBottom: `1px solid ${p.borderSubtle}`, borderLeft: sel ? `3px solid ${p.red}` : "3px solid transparent" }}
                  onMouseEnter={() => setIdx(i)}>
                  <span className="w-[5px] h-[5px] shrink-0" style={{ background: r.project.color }} />
                  <span className="text-[11px] font-bold uppercase" style={{ fontFamily: heading, color: p.textSecondary }}>{r.project.name}</span>
                  <span className="text-[9px]" style={{ color: p.textDim }}>PRJ</span>
                </button>
              );
            }
            return (
              <button key={`a-${r.label}`} type="button" onClick={() => { r.action(); s.closeCmd(); }}
                className="w-full text-left px-4 py-2 flex items-center gap-3 transition-colors"
                style={{ background: sel ? p.surfaceActive : "transparent", borderBottom: `1px solid ${p.borderSubtle}`, borderLeft: sel ? `3px solid ${p.red}` : "3px solid transparent" }}
                onMouseEnter={() => setIdx(i)}>
                <span className="text-[10px]" style={{ color: p.red }}>→</span>
                <span className="text-[11px]" style={{ color: p.textSecondary }}>{r.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Terminal({ p, project, onClose }: { p: P; project: string; onClose: () => void }) {
  const lines = [`> cd ~/projects/${project}`, `> git status`, `On branch main`, `Your branch is up to date with 'origin/main'.`,
    ``, `Changes not staged for commit:`, `  modified:   src/index.ts`, `  modified:   src/utils.ts`, ``, `> █`];
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 animate-slide-up" style={{ height: "220px", borderTop: `2px solid ${p.red}` }}>
      <div className="h-full flex flex-col" style={{ background: p.bg }}>
        <div className="flex items-center justify-between px-6 h-9 shrink-0" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase" style={{ fontFamily: heading, color: p.red }}>TERM</span>
            <span className="text-[9px] uppercase" style={{ color: p.textDim }}>{project}</span>
          </div>
          <button type="button" onClick={onClose} className="text-[10px]" style={{ color: p.textDim }}>×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {lines.map((line, i) => (
            <div key={i} className="text-[11px] leading-[2]" style={{ color: line.startsWith(">") ? p.textSecondary : p.textDim }}>{line || "\u00A0"}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FloatingQ({ p, convo, onAnswer, onOpen }: { p: P; convo: Convo; onAnswer: (a: string) => void; onOpen: () => void }) {
  const dot = statusDot(convo.status);
  return (
    <div className="animate-slide-in-right" style={{ background: p.surface, borderTop: `2px solid ${p.red}`, borderLeft: `1px solid ${p.border}`, borderRight: `1px solid ${p.border}`, borderBottom: `1px solid ${p.border}`, padding: "12px 16px" }}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-[5px] h-[5px] ${dot.cls}`} style={{ background: dot.bg }} />
        <button type="button" onClick={onOpen} className="text-[12px] font-bold uppercase tracking-tight truncate" style={{ fontFamily: heading, color: p.text }}>{convo.title}</button>
        <span className="text-[9px] px-1 py-0.5 shrink-0" style={{ color: convo.project.color, background: `${convo.project.color}08` }}>{convo.project.name}</span>
      </div>
      <p className="text-[10px] leading-relaxed mb-2.5" style={{ color: p.questionText }}>{convo.questionText}</p>
      <div className="flex items-center gap-0 flex-wrap">
        {convo.questionOptions?.map((opt, i) => (
          <button key={opt} type="button" onClick={() => onAnswer(opt)}
            className="text-[9px] px-3 py-1 transition-all border-t border-b border-r"
            style={{ color: p.red, borderColor: p.questionBorder, background: "transparent", borderLeft: i === 0 ? `1px solid ${p.questionBorder}` : "none" }}>{opt}</button>
        ))}
      </div>
    </div>
  );
}
