import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { PROJECTS, statusDot, type Convo, type Status, type Project } from "../lib/design-data";
import { useRelayState, usePaneInput, type CmdResult } from "../lib/design-logic";

export const Route = createFileRoute("/2")({
  component: DesignNeonNoir,
});

const palette = {
  dark: {
    bg: "#050508",
    surface: "#0A0A10",
    surfaceHover: "rgba(0,255,255,0.02)",
    surfaceActive: "rgba(0,255,255,0.04)",
    border: "#111118",
    borderSubtle: "#0C0C12",
    text: "#C8D0E0",
    textSecondary: "#8892A8",
    textMuted: "#5A6278",
    textDim: "#3E4458",
    textGhost: "#1E2230",
    cyan: "#00E5FF",
    cyanSoft: "rgba(0,229,255,0.06)",
    cyanGlow: "rgba(0,229,255,0.15)",
    magenta: "#FF00AA",
    magentaSoft: "rgba(255,0,170,0.06)",
    questionBg: "rgba(255,0,170,0.04)",
    questionBorder: "rgba(255,0,170,0.15)",
    questionText: "#FF6AD5",
    overlay: "rgba(0,0,0,0.8)",
    cmdBg: "#08080E",
    scanline: "rgba(0,229,255,0.015)",
  },
  light: {
    bg: "#F0F2F8",
    surface: "#FFFFFF",
    surfaceHover: "rgba(0,0,30,0.02)",
    surfaceActive: "rgba(0,0,30,0.05)",
    border: "#D8DCE8",
    borderSubtle: "#E8EAF0",
    text: "#0A0A18",
    textSecondary: "#3A3E50",
    textMuted: "#6870848",
    textDim: "#9EA4B8",
    textGhost: "#D0D4E0",
    cyan: "#0088AA",
    cyanSoft: "rgba(0,136,170,0.06)",
    cyanGlow: "rgba(0,136,170,0.12)",
    magenta: "#CC0088",
    magentaSoft: "rgba(204,0,136,0.06)",
    questionBg: "rgba(204,0,136,0.04)",
    questionBorder: "rgba(204,0,136,0.15)",
    questionText: "#AA0066",
    overlay: "rgba(0,0,0,0.3)",
    cmdBg: "#FFFFFF",
    scanline: "transparent",
  },
};

type P = typeof palette.dark;

const heading = "'Syne', sans-serif";
const body = "'JetBrains Mono', monospace";

function DesignNeonNoir() {
  const s = useRelayState();
  const p = s.mode === "dark" ? palette.dark : palette.light;

  return (
    <div className="flex h-screen overflow-hidden select-none relative" style={{ fontFamily: body, fontSize: "12px", background: p.bg, color: p.text }}>
      {s.mode === "dark" && (
        <div className="absolute inset-0 pointer-events-none z-0" style={{
          backgroundImage: `repeating-linear-gradient(0deg, ${p.scanline} 0px, ${p.scanline} 1px, transparent 1px, transparent 3px)`,
          backgroundSize: "100% 3px",
        }} />
      )}
      <div className="relative z-10 flex w-full h-full">
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
          <div className="fixed right-6 bottom-6 flex flex-col gap-3 z-40" style={{ maxWidth: "360px" }}>
            {s.notifications.map((nId) => {
              const c = s.convos.find((x) => x.id === nId);
              if (!c) return null;
              return (
                <FloatingQ key={nId} p={p} convo={c} onAnswer={(a) => s.answerQuestion(nId, a)}
                  onOpen={() => { s.selectConvo(nId); s.setNotifications((prev) => prev.filter((x) => x !== nId)); }} />
              );
            })}
          </div>
        )}
      </div>
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
      const colors = ["#00E5FF", "#FF00AA", "#AAFF00", "#FF6600", "#AA00FF"];
      proj = { name: customProject.trim(), color: colors[Math.floor(Math.random() * colors.length)] };
    } else {
      proj = PROJECTS.find((pr) => pr.name === newProjectName) || PROJECTS[0];
    }
    s.createConvo(newTitle.trim(), proj);
    setNewTitle(""); setCustomProject(""); setShowCustom(false);
  }

  return (
    <div className="flex flex-col shrink-0 transition-all duration-300"
      style={{ width: hasPanes ? "360px" : "100%", maxWidth: hasPanes ? "360px" : "none", borderRight: hasPanes ? `1px solid ${p.border}` : "none" }}>

      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-bold tracking-[-0.02em] uppercase" style={{ fontFamily: heading, color: p.cyan, textShadow: s.mode === "dark" ? `0 0 20px ${p.cyanGlow}` : "none" }}>
              {s.showArchived ? "Archive" : "Relay"}
            </h1>
            <div className="h-3 w-px" style={{ background: p.border }} />
            {s.thinkingCount > 0 && !s.showArchived && (
              <span className="text-[10px] uppercase tracking-wider animate-pulse" style={{ color: p.cyan }}>{s.thinkingCount}T</span>
            )}
            {s.waitingCount > 0 && !s.showArchived && (
              <span className="text-[10px] uppercase tracking-wider" style={{ color: p.textDim }}>{s.waitingCount}W</span>
            )}
            {s.questionCount > 0 && !s.showArchived && (
              <span className="text-[10px] uppercase tracking-wider" style={{ color: p.magenta }}>{s.questionCount}Q</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={s.openCmd}
              className="text-[10px] uppercase tracking-wider px-2.5 py-1.5 transition-all"
              style={{ color: p.cyan, border: `1px solid ${p.cyan}30`, background: p.cyanSoft }}>⌘K</button>
            <button type="button" onClick={s.toggleTheme}
              className="text-[10px] px-2 py-1.5 transition-colors"
              style={{ color: p.textDim, border: `1px solid ${p.border}` }}>
              {s.mode === "dark" ? "LIT" : "DRK"}
            </button>
            {!s.showArchived && (
              <button type="button" onClick={() => s.setShowNewForm(!s.showNewForm)}
                className="text-[10px] uppercase tracking-wider px-2.5 py-1.5 transition-all"
                style={{ color: p.magenta, border: `1px solid ${p.magenta}30`, background: p.magentaSoft }}>+NEW</button>
            )}
          </div>
        </div>

        {s.showNewForm && !s.showArchived && (
          <div className="mb-4 p-3 animate-fade-up" style={{ background: p.surface, border: `1px solid ${p.cyan}20`, boxShadow: s.mode === "dark" ? `0 0 20px ${p.cyanSoft}` : "none" }}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitNew(); if (e.key === "Escape") s.setShowNewForm(false); }}
              placeholder="THREAD NAME_"
              className="w-full text-[12px] uppercase tracking-wider bg-transparent focus:outline-none mb-3"
              style={{ color: p.cyan, fontFamily: heading }} autoFocus />
            <div className="flex items-center gap-1 flex-wrap mb-2">
              {PROJECTS.map((pr) => (
                <button key={pr.name} type="button"
                  onClick={() => { setNewProjectName(pr.name); setShowCustom(false); }}
                  className="text-[9px] uppercase tracking-widest px-2 py-1 transition-all"
                  style={{ color: !showCustom && newProjectName === pr.name ? pr.color : p.textDim, border: !showCustom && newProjectName === pr.name ? `1px solid ${pr.color}40` : `1px solid ${p.border}` }}>
                  {pr.name}
                </button>
              ))}
              <button type="button" onClick={() => setShowCustom(!showCustom)}
                className="text-[9px] uppercase tracking-widest px-2 py-1"
                style={{ color: showCustom ? p.cyan : p.textDim, border: showCustom ? `1px solid ${p.cyan}40` : `1px solid ${p.border}` }}>+PRJ</button>
            </div>
            {showCustom && (
              <input value={customProject} onChange={(e) => setCustomProject(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitNew(); }}
                placeholder="project_name" className="w-full text-[10px] bg-transparent focus:outline-none mb-2"
                style={{ color: p.text, borderBottom: `1px solid ${p.border}` }} autoFocus />
            )}
            <button type="button" onClick={submitNew} disabled={!newTitle.trim()}
              className="text-[10px] uppercase tracking-widest transition-all disabled:opacity-20"
              style={{ color: p.cyan }}>CREATE →</button>
          </div>
        )}

        <div className="flex items-center gap-0.5 flex-wrap py-2" style={{ borderTop: `1px solid ${p.border}` }}>
          <button type="button" onClick={() => { s.setShowArchived(false); s.setFilterProject(null); }}
            className="text-[9px] uppercase tracking-widest px-2 py-1 transition-colors"
            style={{ color: !s.filterProject && !s.showArchived ? p.cyan : p.textGhost, background: !s.filterProject && !s.showArchived ? p.cyanSoft : "transparent" }}>
            ALL
          </button>
          {PROJECTS.map((pr) => (
            <button key={pr.name} type="button"
              onClick={() => { s.setShowArchived(false); s.setFilterProject(s.filterProject === pr.name ? null : pr.name); }}
              className="text-[9px] uppercase tracking-widest px-2 py-1 transition-colors flex items-center gap-1"
              style={{ color: s.filterProject === pr.name ? pr.color : p.textGhost }}>
              <span className="w-1.5 h-1.5 inline-block" style={{ background: pr.color, opacity: s.filterProject === pr.name ? 1 : 0.2, boxShadow: s.filterProject === pr.name && s.mode === "dark" ? `0 0 6px ${pr.color}60` : "none" }} />
              {pr.name}
            </button>
          ))}
          <span className="text-[9px] mx-0.5" style={{ color: p.textGhost }}>/</span>
          {(["thinking", "waiting", "error"] as Status[]).map((st) => (
            <button key={st} type="button" onClick={() => s.setFilterStatus(s.filterStatus === st ? null : st)}
              className="text-[9px] uppercase tracking-widest px-2 py-1 transition-colors"
              style={{ color: s.filterStatus === st ? p.textSecondary : p.textGhost }}>
              {st.slice(0, 3)}
            </button>
          ))}
          <span className="text-[9px] mx-0.5" style={{ color: p.textGhost }}>/</span>
          <button type="button" onClick={() => { s.setShowArchived(!s.showArchived); s.setFilterProject(null); s.setFilterStatus(null); }}
            className="text-[9px] uppercase tracking-widest px-2 py-1 transition-colors"
            style={{ color: s.showArchived ? p.textSecondary : p.textGhost }}>ARC</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {s.filtered.map((c) => {
          const isOpen = s.openPanes.includes(c.id);
          const isHov = c.id === hoveredId;
          const isDO = c.id === s.dragOverId;
          const dot = statusDot(c.status);
          return (
            <div key={c.id} className="relative" draggable={!s.showArchived}
              onDragStart={() => s.handleDragStart(c.id)} onDragOver={(e) => s.handleDragOver(e, c.id)}
              onDrop={() => s.handleDrop(c.id)} onDragEnd={() => {}}
              onMouseEnter={() => setHoveredId(c.id)} onMouseLeave={() => setHoveredId(null)}>
              {isDO && <div className="absolute top-0 left-5 right-5 h-px" style={{ background: p.cyan, boxShadow: `0 0 8px ${p.cyan}` }} />}
              <button type="button" onClick={() => s.selectConvo(c.id)}
                className="w-full text-left transition-all duration-150"
                style={{
                  background: isOpen ? p.surfaceActive : isHov ? p.surfaceHover : "transparent",
                  borderBottom: `1px solid ${p.borderSubtle}`,
                  borderLeft: isOpen ? `2px solid ${p.cyan}` : "2px solid transparent",
                }}>
                <div className="px-5 py-2.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-[6px] h-[6px] shrink-0 ${dot.cls}`}
                        style={{ background: dot.bg, boxShadow: c.status === "thinking" && s.mode === "dark" ? `0 0 6px ${dot.bg}` : "none" }} />
                      <span className="text-[12px] font-semibold uppercase tracking-wide truncate"
                        style={{ fontFamily: heading, color: isOpen ? p.text : p.textSecondary }}>{c.title}</span>
                      {c.hasQuestion && (
                        <span className="text-[8px] uppercase tracking-widest px-1 py-0.5 shrink-0" style={{ color: p.magenta, background: p.magentaSoft }}>Q</span>
                      )}
                    </div>
                    <span className="text-[9px] shrink-0 ml-2 tracking-wider uppercase" style={{ color: p.textDim }}>{c.time}</span>
                  </div>
                  <div className="flex items-center gap-2 pl-[20px]">
                    <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 shrink-0"
                      style={{ color: c.project.color, background: `${c.project.color}10` }}>{c.project.name}</span>
                    <span className="text-[10px] truncate" style={{ color: p.textDim }}>{c.lastMessage}</span>
                  </div>
                </div>
              </button>
              {isHov && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 animate-fade-in">
                  {s.showArchived ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); s.unarchiveConvo(c.id); }}
                      className="text-[9px] uppercase tracking-widest px-2 py-1" style={{ color: p.textMuted, border: `1px solid ${p.border}`, background: p.surface }}>RST</button>
                  ) : (
                    <>
                      <button type="button" onClick={(e) => { e.stopPropagation(); s.toggleTerminal(c.project.name); }}
                        className="text-[9px] uppercase tracking-widest px-2 py-1" style={{ color: p.cyan, border: `1px solid ${p.cyan}20`, background: p.cyanSoft }}>TRM</button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); s.archiveConvo(c.id); }}
                        className="text-[9px] uppercase tracking-widest px-2 py-1" style={{ color: p.textMuted, border: `1px solid ${p.border}`, background: p.surface }}>ARC</button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {s.filtered.length === 0 && (
          <div className="px-5 py-20 text-center">
            <p className="text-[11px] uppercase tracking-widest" style={{ color: p.textDim }}>{s.showArchived ? "ARCHIVE EMPTY" : "NO MATCHES"}</p>
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
        <div className="text-[60px] leading-none mb-4" style={{ fontFamily: heading, fontWeight: 800, color: p.textGhost, textShadow: `0 0 40px ${p.cyanSoft}` }}>
          //
        </div>
        <p className="text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: p.textDim }}>NO ACTIVE PANE</p>
        <div className="inline-block px-3 py-1.5" style={{ border: `1px solid ${p.cyan}20`, background: p.cyanSoft }}>
          <span className="text-[9px] uppercase tracking-[0.2em]" style={{ color: p.cyan }}>⌘K TO SEARCH</span>
        </div>
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
      <div className="flex items-center justify-between px-5 h-11 shrink-0" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-[6px] h-[6px] shrink-0 ${dot.cls}`} style={{ background: dot.bg }} />
          <span className="text-[12px] font-bold uppercase tracking-wide truncate" style={{ fontFamily: heading, color: p.text }}>{convo.title}</span>
          <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 shrink-0" style={{ color: convo.project.color, background: `${convo.project.color}10` }}>{convo.project.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onArchive} className="text-[9px] uppercase tracking-widest px-2 py-1" style={{ color: p.textDim }}>ARC</button>
          <button type="button" onClick={onClose} className="text-[12px]" style={{ color: p.textDim }}>×</button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-[580px] mx-auto px-5 py-6">
          {convo.messages.map((msg, i) => (
            <div key={msg.id} className="mb-6" style={{ animation: i === convo.messages.length - 1 ? "fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both" : "none" }}>
              {msg.role === "user" ? (
                <div className="flex items-start gap-2.5">
                  <span className="text-[9px] uppercase tracking-widest shrink-0 mt-[3px] px-1 py-0.5" style={{ color: p.cyan, background: p.cyanSoft }}>YOU</span>
                  <p className="text-[12px] leading-[1.8]" style={{ color: p.textSecondary }}>{msg.content}</p>
                </div>
              ) : (
                <div className="pl-[40px]">
                  <p className="text-[12px] leading-[1.9]" style={{ color: p.text }}>{msg.content}</p>
                </div>
              )}
            </div>
          ))}

          {convo.hasQuestion && convo.questionText && (
            <div className="mb-6 ml-[40px] p-3 animate-scale-in" style={{ background: p.questionBg, borderLeft: `2px solid ${p.magenta}` }}>
              <p className="text-[11px] mb-3 leading-relaxed" style={{ color: p.questionText }}>{convo.questionText}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {convo.questionOptions?.map((opt) => (
                  <button key={opt} type="button" onClick={() => onAnswer(opt)}
                    className="text-[10px] uppercase tracking-wider px-2.5 py-1 transition-all"
                    style={{ color: p.magenta, border: `1px solid ${p.questionBorder}`, background: "transparent" }}>{opt}</button>
                ))}
              </div>
            </div>
          )}

          {isThinking && (
            <div className="pl-[40px] animate-fade-in flex items-center gap-2">
              <div className="w-2 h-2 animate-pulse" style={{ background: p.cyan, boxShadow: `0 0 8px ${p.cyan}` }} />
              <span className="text-[10px] uppercase tracking-widest animate-pulse-soft" style={{ color: p.textDim }}>PROCESSING</span>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-5 py-3" style={{ borderTop: `1px solid ${p.border}` }}>
        <div className="max-w-[580px] mx-auto">
          {queued.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] uppercase tracking-widest" style={{ color: p.textDim }}>{queued.length} QUEUED</span>
              <div className="flex-1 h-px" style={{ background: p.border }} />
            </div>
          )}
          <div className="flex items-end gap-2" style={{ border: `1px solid ${p.border}`, padding: "8px 12px", background: p.surface }}>
            <span className="text-[10px] shrink-0 pb-0.5" style={{ color: p.cyan }}>{">"}</span>
            <textarea ref={inputRef} value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={isThinking ? "QUEUING..." : "INPUT_"}
              rows={1} className="flex-1 text-[12px] focus:outline-none resize-none bg-transparent"
              style={{ color: p.text, caretColor: p.cyan }} />
            <button type="button" onClick={send} disabled={!input.trim()}
              className="text-[9px] uppercase tracking-widest pb-0.5 transition-all disabled:opacity-15"
              style={{ color: p.cyan }}>SEND</button>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: p.textGhost }}>SHIFT+RET = NEWLINE</span>
            {isThinking && <span className="text-[9px] uppercase tracking-wider animate-pulse-soft" style={{ color: p.cyan }}>THINKING</span>}
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
      <div className="w-full max-w-[520px] animate-spotlight-in overflow-hidden"
        style={{ background: p.cmdBg, border: `1px solid ${p.cyan}15`, boxShadow: `0 0 60px ${p.cyanSoft}, 0 30px 80px rgba(0,0,0,0.6)` }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${p.border}` }}>
          <span className="text-[10px]" style={{ color: p.cyan }}>⌕</span>
          <input ref={s.cmdInputRef} value={s.cmdQuery} onChange={(e) => s.setCmdQuery(e.target.value)} onKeyDown={onKey}
            placeholder="SEARCH_" className="flex-1 text-[12px] bg-transparent focus:outline-none uppercase tracking-wider"
            style={{ color: p.text, caretColor: p.cyan, fontFamily: heading }} />
          <span className="text-[9px] uppercase tracking-widest" style={{ color: p.textGhost }}>ESC</span>
        </div>
        <div className="max-h-[360px] overflow-y-auto py-1">
          {s.cmdResults.length === 0 && (
            <div className="px-4 py-8 text-center"><p className="text-[10px] uppercase tracking-widest" style={{ color: p.textDim }}>NO RESULTS</p></div>
          )}
          {s.cmdResults.map((r: CmdResult, i: number) => {
            const sel = i === idx;
            if (r.type === "chat") {
              const dot = statusDot(r.convo.status);
              return (
                <button key={`c-${r.convo.id}`} type="button" onClick={() => { s.selectConvo(r.convo.id); s.closeCmd(); }}
                  className="w-full text-left px-4 py-2 flex items-center gap-2.5 transition-colors"
                  style={{ background: sel ? p.surfaceActive : "transparent", borderLeft: sel ? `2px solid ${p.cyan}` : "2px solid transparent" }}
                  onMouseEnter={() => setIdx(i)}>
                  <div className={`w-[5px] h-[5px] shrink-0 ${dot.cls}`} style={{ background: dot.bg }} />
                  <span className="text-[11px] uppercase tracking-wide truncate flex-1" style={{ fontFamily: heading, color: p.textSecondary }}>{r.convo.title}</span>
                  <span className="text-[9px] uppercase tracking-widest shrink-0" style={{ color: r.convo.project.color }}>{r.convo.project.name}</span>
                </button>
              );
            }
            if (r.type === "project") {
              return (
                <button key={`p-${r.project.name}`} type="button" onClick={() => { s.setFilterProject(r.project.name); s.closeCmd(); }}
                  className="w-full text-left px-4 py-2 flex items-center gap-2.5 transition-colors"
                  style={{ background: sel ? p.surfaceActive : "transparent", borderLeft: sel ? `2px solid ${p.cyan}` : "2px solid transparent" }}
                  onMouseEnter={() => setIdx(i)}>
                  <div className="w-[5px] h-[5px] shrink-0" style={{ background: r.project.color }} />
                  <span className="text-[11px] uppercase tracking-wide" style={{ fontFamily: heading, color: p.textSecondary }}>{r.project.name}</span>
                  <span className="text-[9px] uppercase tracking-widest" style={{ color: p.textDim }}>PRJ</span>
                </button>
              );
            }
            return (
              <button key={`a-${r.label}`} type="button" onClick={() => { r.action(); s.closeCmd(); }}
                className="w-full text-left px-4 py-2 flex items-center gap-2.5 transition-colors"
                style={{ background: sel ? p.surfaceActive : "transparent", borderLeft: sel ? `2px solid ${p.cyan}` : "2px solid transparent" }}
                onMouseEnter={() => setIdx(i)}>
                <span className="text-[10px]" style={{ color: p.cyan }}>→</span>
                <span className="text-[11px] uppercase tracking-wide" style={{ color: p.textSecondary }}>{r.label}</span>
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
    <div className="fixed inset-x-0 bottom-0 z-40 animate-slide-up" style={{ height: "220px" }}>
      <div className="h-full flex flex-col" style={{ background: "#040408", borderTop: `1px solid ${p.cyan}15` }}>
        <div className="flex items-center justify-between px-5 h-9 shrink-0" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-widest" style={{ color: p.cyan }}>TERM</span>
            <span className="text-[9px] uppercase tracking-widest" style={{ color: p.textDim }}>{project}</span>
          </div>
          <button type="button" onClick={onClose} className="text-[12px]" style={{ color: p.textDim }}>×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {lines.map((line, i) => (
            <div key={i} className="text-[11px] leading-[1.9]" style={{ color: line.startsWith(">") ? p.cyan : p.textDim, fontFamily: body }}>{line || "\u00A0"}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FloatingQ({ p, convo, onAnswer, onOpen }: { p: P; convo: Convo; onAnswer: (a: string) => void; onOpen: () => void }) {
  const dot = statusDot(convo.status);
  return (
    <div className="animate-slide-in-right" style={{ background: p.cmdBg, borderLeft: `2px solid ${p.magenta}`, padding: "12px 14px", boxShadow: `0 0 30px ${p.magentaSoft}, 0 12px 40px rgba(0,0,0,0.5)` }}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-[5px] h-[5px] ${dot.cls}`} style={{ background: dot.bg }} />
        <button type="button" onClick={onOpen} className="text-[11px] font-bold uppercase tracking-wide truncate" style={{ fontFamily: heading, color: p.text }}>{convo.title}</button>
        <span className="text-[9px] uppercase tracking-widest shrink-0" style={{ color: convo.project.color }}>{convo.project.name}</span>
      </div>
      <p className="text-[10px] leading-relaxed mb-2.5" style={{ color: p.questionText }}>{convo.questionText}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {convo.questionOptions?.map((opt) => (
          <button key={opt} type="button" onClick={() => onAnswer(opt)}
            className="text-[9px] uppercase tracking-wider px-2 py-1 transition-all"
            style={{ color: p.magenta, border: `1px solid ${p.questionBorder}`, background: "transparent" }}>{opt}</button>
        ))}
      </div>
    </div>
  );
}
