import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { PROJECTS, statusDot, type Convo, type Status, type Project } from "../lib/design-data";
import { useRelayState, usePaneInput, type CmdResult } from "../lib/design-logic";

export const Route = createFileRoute("/5")({
  component: DesignMidnightGlass,
});

const palette = {
  dark: {
    bg: "#080B14",
    bgGrad: "linear-gradient(165deg, #080B14 0%, #0D1020 40%, #0F0D1A 100%)",
    surface: "rgba(255,255,255,0.03)",
    surfaceHover: "rgba(255,255,255,0.04)",
    surfaceActive: "rgba(255,255,255,0.06)",
    glass: "rgba(15,18,35,0.7)",
    glassBorder: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.05)",
    borderSubtle: "rgba(255,255,255,0.03)",
    text: "#C8CDE0",
    textSecondary: "#8B92B0",
    textMuted: "#5D6480",
    textDim: "#3D4460",
    textGhost: "#1E2240",
    lavender: "#A78BFA",
    lavenderSoft: "rgba(167,139,250,0.06)",
    lavenderGlow: "rgba(167,139,250,0.12)",
    teal: "#5EEAD4",
    tealSoft: "rgba(94,234,212,0.06)",
    questionBg: "rgba(94,234,212,0.04)",
    questionBorder: "rgba(94,234,212,0.12)",
    questionText: "#5EEAD4",
    overlay: "rgba(4,6,15,0.7)",
    cmdBg: "rgba(12,15,30,0.9)",
  },
  light: {
    bg: "#EFF1F8",
    bgGrad: "linear-gradient(165deg, #EFF1F8 0%, #E8EBF5 40%, #F0EDF5 100%)",
    surface: "rgba(255,255,255,0.7)",
    surfaceHover: "rgba(255,255,255,0.5)",
    surfaceActive: "rgba(255,255,255,0.8)",
    glass: "rgba(255,255,255,0.65)",
    glassBorder: "rgba(0,0,0,0.06)",
    border: "rgba(0,0,0,0.06)",
    borderSubtle: "rgba(0,0,0,0.03)",
    text: "#1E1E30",
    textSecondary: "#4A4E68",
    textMuted: "#7078A0",
    textDim: "#A0A6C0",
    textGhost: "#D0D4E0",
    lavender: "#7C3AED",
    lavenderSoft: "rgba(124,58,237,0.06)",
    lavenderGlow: "rgba(124,58,237,0.1)",
    teal: "#0D9488",
    tealSoft: "rgba(13,148,136,0.06)",
    questionBg: "rgba(13,148,136,0.04)",
    questionBorder: "rgba(13,148,136,0.12)",
    questionText: "#0D9488",
    overlay: "rgba(0,0,0,0.2)",
    cmdBg: "rgba(255,255,255,0.85)",
  },
};

type P = typeof palette.dark;
const serif = "'Newsreader', serif";
const mono = "'Geist Mono', monospace";

function DesignMidnightGlass() {
  const s = useRelayState();
  const p = s.mode === "dark" ? palette.dark : palette.light;

  return (
    <div className="flex h-screen overflow-hidden select-none" style={{ fontFamily: `${serif}`, background: p.bgGrad, color: p.text }}>
      <ListPanel s={s} p={p} />
      <div className="flex-1 flex min-w-0 p-4 gap-4">
        {s.openPanes.length === 0 && <EmptyState p={p} />}
        {s.openPanes.map((id) => {
          const convo = s.convos.find((c) => c.id === id);
          if (!convo) return null;
          return (
            <ChatPane key={id} p={p} convo={convo}
              onClose={() => s.closePane(id)} onSend={(text) => s.sendMessage(id, text)}
              onArchive={() => s.archiveConvo(id)} onAnswer={(a) => s.answerQuestion(id, a)} />
          );
        })}
      </div>
      {s.showCmd && <CmdPalette s={s} p={p} />}
      {s.terminalProject && <Terminal p={p} project={s.terminalProject} onClose={() => s.toggleTerminal(s.terminalProject!)} />}
      {s.notifications.length > 0 && s.openPanes.length === 0 && (
        <div className="fixed right-6 bottom-6 flex flex-col gap-3 z-40" style={{ maxWidth: "380px" }}>
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
      const colors = ["#A78BFA", "#5EEAD4", "#FB923C", "#F472B6", "#38BDF8"];
      proj = { name: customProject.trim(), color: colors[Math.floor(Math.random() * colors.length)] };
    } else { proj = PROJECTS.find((pr) => pr.name === newProjectName) || PROJECTS[0]; }
    s.createConvo(newTitle.trim(), proj);
    setNewTitle(""); setCustomProject(""); setShowCustom(false);
  }

  return (
    <div className="flex flex-col shrink-0 transition-all duration-500"
      style={{ width: hasPanes ? "370px" : "100%", maxWidth: hasPanes ? "370px" : "none", borderRight: hasPanes ? `1px solid ${p.border}` : "none" }}>
      <div className="px-6 pt-6 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[24px] font-normal italic leading-none" style={{ fontFamily: serif, color: p.text }}>
              {s.showArchived ? "Archive" : "Relay"}
            </h1>
            <div className="flex items-center gap-2">
              {s.thinkingCount > 0 && !s.showArchived && (
                <span className="text-[10px] animate-pulse" style={{ color: p.lavender, fontFamily: mono }}>{s.thinkingCount}t</span>
              )}
              {s.waitingCount > 0 && !s.showArchived && (
                <span className="text-[10px]" style={{ color: p.textDim, fontFamily: mono }}>{s.waitingCount}w</span>
              )}
              {s.questionCount > 0 && !s.showArchived && (
                <span className="text-[10px]" style={{ color: p.teal, fontFamily: mono }}>{s.questionCount}q</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={s.openCmd}
              className="text-[11px] px-3 py-1.5 transition-all backdrop-blur-sm"
              style={{ color: p.textMuted, background: p.glass, border: `1px solid ${p.glassBorder}`, borderRadius: "8px" }}>⌘K</button>
            <button type="button" onClick={s.toggleTheme}
              className="text-[13px] w-8 h-8 flex items-center justify-center transition-all backdrop-blur-sm"
              style={{ color: p.textMuted, background: p.glass, border: `1px solid ${p.glassBorder}`, borderRadius: "8px" }}>
              {s.mode === "dark" ? "☀" : "☾"}
            </button>
            {!s.showArchived && (
              <button type="button" onClick={() => s.setShowNewForm(!s.showNewForm)}
                className="text-[11px] px-3 py-1.5 transition-all"
                style={{ color: p.lavender, background: p.lavenderSoft, border: `1px solid ${p.lavenderGlow}`, borderRadius: "8px" }}>
                + new
              </button>
            )}
          </div>
        </div>

        {s.showNewForm && !s.showArchived && (
          <div className="mb-4 p-4 animate-fade-up backdrop-blur-md" style={{ background: p.glass, border: `1px solid ${p.glassBorder}`, borderRadius: "12px" }}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitNew(); if (e.key === "Escape") s.setShowNewForm(false); }}
              placeholder="Thread name..."
              className="w-full text-[15px] italic bg-transparent focus:outline-none mb-3"
              style={{ color: p.text, fontFamily: serif }} autoFocus />
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {PROJECTS.map((pr) => (
                <button key={pr.name} type="button" onClick={() => { setNewProjectName(pr.name); setShowCustom(false); }}
                  className="text-[10px] px-2.5 py-1 transition-all"
                  style={{
                    color: !showCustom && newProjectName === pr.name ? pr.color : p.textDim,
                    background: !showCustom && newProjectName === pr.name ? `${pr.color}12` : "transparent",
                    border: !showCustom && newProjectName === pr.name ? `1px solid ${pr.color}25` : `1px solid transparent`,
                    borderRadius: "6px", fontFamily: mono,
                  }}>{pr.name}</button>
              ))}
              <button type="button" onClick={() => setShowCustom(!showCustom)}
                className="text-[10px] px-2.5 py-1 transition-all"
                style={{ color: showCustom ? p.lavender : p.textDim, borderRadius: "6px", fontFamily: mono }}>+ project</button>
            </div>
            {showCustom && (
              <input value={customProject} onChange={(e) => setCustomProject(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitNew(); }}
                placeholder="Project name..." className="w-full text-[11px] bg-transparent focus:outline-none mb-2"
                style={{ color: p.text, borderBottom: `1px solid ${p.border}`, fontFamily: mono }} autoFocus />
            )}
            <div className="flex justify-end mt-2">
              <button type="button" onClick={submitNew} disabled={!newTitle.trim()}
                className="text-[11px] px-3 py-1.5 transition-all disabled:opacity-20"
                style={{ color: p.lavender, background: p.lavenderSoft, border: `1px solid ${p.lavenderGlow}`, borderRadius: "6px" }}>create →</button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <button type="button" onClick={() => { s.setShowArchived(false); s.setFilterProject(null); }}
            className="text-[10px] px-2.5 py-1 transition-all"
            style={{ color: !s.filterProject && !s.showArchived ? p.text : p.textDim, background: !s.filterProject && !s.showArchived ? p.surfaceActive : "transparent", borderRadius: "6px", fontFamily: mono }}>all</button>
          {PROJECTS.map((pr) => (
            <button key={pr.name} type="button"
              onClick={() => { s.setShowArchived(false); s.setFilterProject(s.filterProject === pr.name ? null : pr.name); }}
              className="text-[10px] px-2.5 py-1 transition-all flex items-center gap-1.5"
              style={{ color: s.filterProject === pr.name ? pr.color : p.textDim, background: s.filterProject === pr.name ? `${pr.color}10` : "transparent", borderRadius: "6px", fontFamily: mono }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: pr.color, opacity: s.filterProject === pr.name ? 1 : 0.25 }} />
              {pr.name}
            </button>
          ))}
          <span className="text-[10px] mx-0.5" style={{ color: p.textGhost }}>·</span>
          {(["thinking", "waiting", "error"] as Status[]).map((st) => (
            <button key={st} type="button" onClick={() => s.setFilterStatus(s.filterStatus === st ? null : st)}
              className="text-[10px] px-2.5 py-1 transition-all"
              style={{ color: s.filterStatus === st ? p.textSecondary : p.textGhost, borderRadius: "6px", fontFamily: mono }}>{st}</button>
          ))}
          <span className="text-[10px] mx-0.5" style={{ color: p.textGhost }}>·</span>
          <button type="button" onClick={() => { s.setShowArchived(!s.showArchived); s.setFilterProject(null); s.setFilterStatus(null); }}
            className="text-[10px] px-2.5 py-1 transition-all italic"
            style={{ color: s.showArchived ? p.textSecondary : p.textGhost, borderRadius: "6px" }}>archived</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {s.filtered.map((c) => {
          const isOpen = s.openPanes.includes(c.id);
          const isHov = c.id === hoveredId;
          const isDO = c.id === s.dragOverId;
          const dot = statusDot(c.status);
          return (
            <div key={c.id} className="relative px-3" draggable={!s.showArchived}
              onDragStart={() => s.handleDragStart(c.id)} onDragOver={(e) => s.handleDragOver(e, c.id)}
              onDrop={() => s.handleDrop(c.id)} onDragEnd={() => {}}
              onMouseEnter={() => setHoveredId(c.id)} onMouseLeave={() => setHoveredId(null)}>
              {isDO && <div className="absolute top-0 left-6 right-6 h-[2px] rounded-full" style={{ background: p.lavender, boxShadow: `0 0 8px ${p.lavenderGlow}` }} />}
              <button type="button" onClick={() => s.selectConvo(c.id)}
                className="w-full text-left transition-all duration-200 mb-0.5"
                style={{
                  background: isOpen ? p.surfaceActive : isHov ? p.surfaceHover : "transparent",
                  borderRadius: "8px",
                  padding: "10px 12px",
                }}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-[6px] h-[6px] rounded-full shrink-0 ${dot.cls}`}
                      style={{ background: dot.bg, boxShadow: c.status !== "idle" && s.mode === "dark" ? `0 0 6px ${dot.bg}60` : "none" }} />
                    <span className="text-[14px] font-normal truncate italic" style={{ fontFamily: serif, color: isOpen ? p.text : p.textSecondary }}>
                      {c.title}
                    </span>
                    {c.hasQuestion && (
                      <span className="text-[9px] px-1.5 py-0.5 shrink-0" style={{ color: p.teal, background: p.tealSoft, borderRadius: "4px", fontFamily: mono }}>?</span>
                    )}
                  </div>
                  <span className="text-[10px] shrink-0 ml-2" style={{ color: p.textDim, fontFamily: mono }}>{c.time}</span>
                </div>
                <div className="flex items-center gap-2 pl-[20px]">
                  <span className="text-[10px] px-2 py-0.5 shrink-0" style={{ color: c.project.color, background: `${c.project.color}10`, borderRadius: "4px", fontFamily: mono }}>{c.project.name}</span>
                  <span className="text-[11px] truncate italic" style={{ color: p.textDim }}>{c.lastMessage}</span>
                </div>
              </button>
              {isHov && (
                <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 animate-fade-in">
                  {s.showArchived ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); s.unarchiveConvo(c.id); }}
                      className="text-[10px] px-2.5 py-1 backdrop-blur-sm transition-all"
                      style={{ color: p.textMuted, background: p.glass, border: `1px solid ${p.glassBorder}`, borderRadius: "6px", fontFamily: mono }}>restore</button>
                  ) : (
                    <>
                      <button type="button" onClick={(e) => { e.stopPropagation(); s.toggleTerminal(c.project.name); }}
                        className="text-[10px] px-2.5 py-1 backdrop-blur-sm transition-all"
                        style={{ color: p.textMuted, background: p.glass, border: `1px solid ${p.glassBorder}`, borderRadius: "6px", fontFamily: mono }}>term</button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); s.archiveConvo(c.id); }}
                        className="text-[10px] px-2.5 py-1 backdrop-blur-sm transition-all"
                        style={{ color: p.textMuted, background: p.glass, border: `1px solid ${p.glassBorder}`, borderRadius: "6px", fontFamily: mono }}>archive</button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {s.filtered.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-[14px] italic" style={{ color: p.textDim, fontFamily: serif }}>{s.showArchived ? "Archive is empty" : "No conversations found"}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ p }: { p: P }) {
  return (
    <div className="flex-1 flex items-center justify-center backdrop-blur-sm" style={{ background: p.glass, borderRadius: "14px", border: `1px solid ${p.glassBorder}` }}>
      <div className="text-center animate-fade-in">
        <div className="w-20 h-20 mx-auto mb-5 flex items-center justify-center rounded-full"
          style={{ background: p.lavenderSoft, border: `1px solid ${p.lavenderGlow}` }}>
          <span className="text-[28px]" style={{ color: p.lavender, opacity: 0.5 }}>◇</span>
        </div>
        <p className="text-[15px] italic mb-2" style={{ color: p.textDim, fontFamily: serif }}>No pane selected</p>
        <kbd className="text-[10px] px-3 py-1.5 inline-block backdrop-blur-sm" style={{ color: p.textMuted, background: p.glass, border: `1px solid ${p.glassBorder}`, borderRadius: "6px", fontFamily: mono }}>⌘K</kbd>
      </div>
    </div>
  );
}

function ChatPane({ p, convo, onClose, onSend, onArchive, onAnswer }: {
  p: P; convo: Convo;
  onClose: () => void; onSend: (t: string) => void; onArchive: () => void; onAnswer: (a: string) => void;
}) {
  const { input, setInput, queued, inputRef, isThinking, send } = usePaneInput(convo.status, onSend);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
  }, [convo.messages.length]);
  const dot = statusDot(convo.status);

  return (
    <div className="flex flex-col min-w-0 animate-slide-in-right overflow-hidden backdrop-blur-sm"
      style={{ flex: 1, background: p.glass, borderRadius: "14px", border: `1px solid ${p.glassBorder}` }}>
      <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-[6px] h-[6px] rounded-full shrink-0 ${dot.cls}`} style={{ background: dot.bg, boxShadow: convo.status !== "idle" ? `0 0 6px ${dot.bg}60` : "none" }} />
          <span className="text-[15px] italic truncate" style={{ fontFamily: serif, color: p.text }}>{convo.title}</span>
          <span className="text-[10px] px-2 py-0.5 shrink-0" style={{ color: convo.project.color, background: `${convo.project.color}10`, borderRadius: "4px", fontFamily: mono }}>{convo.project.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onArchive} className="text-[10px] px-2 py-1 transition-colors" style={{ color: p.textDim, fontFamily: mono }}>archive</button>
          <button type="button" onClick={onClose} className="w-6 h-6 flex items-center justify-center transition-all" style={{ color: p.textDim, background: p.surfaceHover, borderRadius: "6px" }}>×</button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-[580px] mx-auto px-6 py-6">
          {convo.messages.map((msg, i) => (
            <div key={msg.id} className="mb-6" style={{ animation: i === convo.messages.length - 1 ? "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both" : "none" }}>
              {msg.role === "user" ? (
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-[9px]" style={{ background: p.lavender, opacity: 0.5 }} />
                  <p className="text-[14px] leading-[1.8]" style={{ color: p.textSecondary, fontFamily: serif }}>{msg.content}</p>
                </div>
              ) : (
                <div className="pl-[18px]">
                  <p className="text-[14px] leading-[1.9]" style={{ color: p.text, fontFamily: serif }}>{msg.content}</p>
                </div>
              )}
            </div>
          ))}
          {convo.hasQuestion && convo.questionText && (
            <div className="mb-6 ml-[18px] p-4 animate-scale-in backdrop-blur-sm"
              style={{ background: p.questionBg, border: `1px solid ${p.questionBorder}`, borderRadius: "10px" }}>
              <p className="text-[13px] italic mb-3 leading-relaxed" style={{ color: p.questionText, fontFamily: serif }}>{convo.questionText}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {convo.questionOptions?.map((opt) => (
                  <button key={opt} type="button" onClick={() => onAnswer(opt)}
                    className="text-[11px] px-3 py-1.5 transition-all backdrop-blur-sm"
                    style={{ color: p.questionText, border: `1px solid ${p.questionBorder}`, borderRadius: "6px", background: "transparent", fontFamily: mono }}>{opt}</button>
                ))}
              </div>
            </div>
          )}
          {isThinking && (
            <div className="pl-[18px] animate-fade-in flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: p.lavender, boxShadow: `0 0 8px ${p.lavenderGlow}` }} />
              <span className="text-[12px] italic animate-pulse-soft" style={{ color: p.textDim, fontFamily: serif }}>thinking...</span>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-5 py-4" style={{ borderTop: `1px solid ${p.border}` }}>
        <div className="max-w-[580px] mx-auto">
          {queued.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px]" style={{ color: p.textDim, fontFamily: mono }}>{queued.length} queued</span>
              <div className="flex-1 h-px" style={{ background: p.border }} />
            </div>
          )}
          <div className="flex items-end gap-2 backdrop-blur-sm" style={{ background: p.surface, border: `1px solid ${p.glassBorder}`, borderRadius: "10px", padding: "10px 14px" }}>
            <textarea ref={inputRef} value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={isThinking ? "Will be queued..." : "Continue..."}
              rows={1} className="flex-1 text-[14px] italic focus:outline-none resize-none bg-transparent"
              style={{ color: p.text, caretColor: p.lavender, fontFamily: serif }} />
            <button type="button" onClick={send} disabled={!input.trim()}
              className="w-8 h-8 flex items-center justify-center transition-all disabled:opacity-15 shrink-0"
              style={{ background: p.lavenderSoft, borderRadius: "8px", border: `1px solid ${p.lavenderGlow}`, color: p.lavender }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[9px]" style={{ color: p.textGhost, fontFamily: mono }}>shift+enter for new line</span>
            {isThinking && <span className="text-[9px] italic animate-pulse-soft" style={{ color: p.textDim }}>thinking...</span>}
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
      <div className="w-full max-w-[520px] animate-spotlight-in overflow-hidden backdrop-blur-xl"
        style={{ background: p.cmdBg, borderRadius: "14px", border: `1px solid ${p.glassBorder}`, boxShadow: `0 25px 80px rgba(0,0,0,0.4), 0 0 40px ${p.lavenderSoft}` }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${p.border}` }}>
          <span className="text-[14px]" style={{ color: p.lavender, opacity: 0.5 }}>◇</span>
          <input ref={s.cmdInputRef} value={s.cmdQuery} onChange={(e) => s.setCmdQuery(e.target.value)} onKeyDown={onKey}
            placeholder="Search everything..."
            className="flex-1 text-[15px] italic bg-transparent focus:outline-none"
            style={{ color: p.text, caretColor: p.lavender, fontFamily: serif }} />
          <kbd className="text-[10px] px-2 py-0.5" style={{ color: p.textDim, background: p.surfaceHover, borderRadius: "4px", fontFamily: mono }}>esc</kbd>
        </div>
        <div className="max-h-[380px] overflow-y-auto py-2">
          {s.cmdResults.length === 0 && <div className="px-5 py-8 text-center"><p className="text-[14px] italic" style={{ color: p.textDim, fontFamily: serif }}>No results</p></div>}
          {s.cmdResults.map((r: CmdResult, i: number) => {
            const sel = i === idx;
            if (r.type === "chat") {
              const dot = statusDot(r.convo.status);
              return (
                <button key={`c-${r.convo.id}`} type="button" onClick={() => { s.selectConvo(r.convo.id); s.closeCmd(); }}
                  className="w-full text-left px-5 py-2.5 flex items-center gap-3 transition-all"
                  style={{ background: sel ? p.surfaceActive : "transparent", borderRadius: sel ? "6px" : "0" }}
                  onMouseEnter={() => setIdx(i)}>
                  <div className={`w-[5px] h-[5px] rounded-full shrink-0 ${dot.cls}`} style={{ background: dot.bg }} />
                  <span className="text-[14px] italic truncate flex-1" style={{ fontFamily: serif, color: p.textSecondary }}>{r.convo.title}</span>
                  <span className="text-[10px] px-2 py-0.5 shrink-0" style={{ color: r.convo.project.color, background: `${r.convo.project.color}10`, borderRadius: "4px", fontFamily: mono }}>{r.convo.project.name}</span>
                </button>
              );
            }
            if (r.type === "project") {
              return (
                <button key={`p-${r.project.name}`} type="button" onClick={() => { s.setFilterProject(r.project.name); s.closeCmd(); }}
                  className="w-full text-left px-5 py-2.5 flex items-center gap-3 transition-all"
                  style={{ background: sel ? p.surfaceActive : "transparent" }} onMouseEnter={() => setIdx(i)}>
                  <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: r.project.color }} />
                  <span className="text-[14px] italic" style={{ fontFamily: serif, color: p.textSecondary }}>{r.project.name}</span>
                  <span className="text-[10px]" style={{ color: p.textDim, fontFamily: mono }}>project</span>
                </button>
              );
            }
            return (
              <button key={`a-${r.label}`} type="button" onClick={() => { r.action(); s.closeCmd(); }}
                className="w-full text-left px-5 py-2.5 flex items-center gap-3 transition-all"
                style={{ background: sel ? p.surfaceActive : "transparent" }} onMouseEnter={() => setIdx(i)}>
                <span className="text-[12px]" style={{ color: p.lavender }}>→</span>
                <span className="text-[14px] italic" style={{ fontFamily: serif, color: p.textSecondary }}>{r.label}</span>
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
    <div className="fixed inset-x-4 bottom-4 z-40 animate-slide-up overflow-hidden backdrop-blur-md"
      style={{ height: "220px", borderRadius: "14px", border: `1px solid ${p.glassBorder}`, boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
      <div className="h-full flex flex-col" style={{ background: p.glass }}>
        <div className="flex items-center justify-between px-5 h-10 shrink-0" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div className="flex items-center gap-2">
            <span className="text-[11px]" style={{ color: p.textMuted, fontFamily: mono }}>terminal</span>
            <span className="text-[10px] px-2 py-0.5" style={{ color: p.textDim, background: p.surfaceHover, borderRadius: "4px", fontFamily: mono }}>{project}</span>
          </div>
          <button type="button" onClick={onClose} className="w-6 h-6 flex items-center justify-center" style={{ color: p.textDim, background: p.surfaceHover, borderRadius: "6px" }}>×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {lines.map((line, i) => (
            <div key={i} className="text-[11px] leading-[1.9]" style={{ color: line.startsWith("$") ? p.textSecondary : p.textDim, fontFamily: mono }}>{line || "\u00A0"}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FloatingQ({ p, convo, onAnswer, onOpen }: { p: P; convo: Convo; onAnswer: (a: string) => void; onOpen: () => void }) {
  const dot = statusDot(convo.status);
  return (
    <div className="animate-slide-in-right backdrop-blur-md" style={{ background: p.glass, border: `1px solid ${p.questionBorder}`, borderRadius: "12px", padding: "14px 16px", boxShadow: `0 8px 40px rgba(0,0,0,0.3), 0 0 20px ${p.tealSoft}` }}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className={`w-[5px] h-[5px] rounded-full ${dot.cls}`} style={{ background: dot.bg }} />
        <button type="button" onClick={onOpen} className="text-[13px] italic truncate" style={{ fontFamily: serif, color: p.text }}>{convo.title}</button>
        <span className="text-[10px] px-2 py-0.5 shrink-0" style={{ color: convo.project.color, background: `${convo.project.color}10`, borderRadius: "4px", fontFamily: mono }}>{convo.project.name}</span>
      </div>
      <p className="text-[12px] italic leading-relaxed mb-3" style={{ color: p.questionText, fontFamily: serif }}>{convo.questionText}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {convo.questionOptions?.map((opt) => (
          <button key={opt} type="button" onClick={() => onAnswer(opt)}
            className="text-[10px] px-3 py-1 transition-all backdrop-blur-sm"
            style={{ color: p.teal, border: `1px solid ${p.questionBorder}`, borderRadius: "6px", background: "transparent", fontFamily: mono }}>{opt}</button>
        ))}
      </div>
    </div>
  );
}
