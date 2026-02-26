import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { PROJECTS, statusDot, type Convo, type Status, type Project } from "../lib/design-data";
import { useRelayState, usePaneInput, type CmdResult } from "../lib/design-logic";

export const Route = createFileRoute("/3")({
  component: DesignSoftClay,
});

const palette = {
  dark: {
    bg: "#1C1917",
    surface: "#231F1B",
    surfaceHover: "rgba(255,235,210,0.025)",
    surfaceActive: "rgba(255,235,210,0.05)",
    card: "#292420",
    border: "#332D27",
    borderSubtle: "#282320",
    text: "#EDE0D0",
    textSecondary: "#BBA890",
    textMuted: "#8A7A65",
    textDim: "#6B5E4D",
    textGhost: "#3D352B",
    accent: "#D4956A",
    accentSoft: "rgba(212,149,106,0.1)",
    green: "#7EBF8E",
    greenSoft: "rgba(126,191,142,0.08)",
    questionBg: "rgba(212,149,106,0.06)",
    questionBorder: "rgba(212,149,106,0.2)",
    questionText: "#D4956A",
    overlay: "rgba(10,8,6,0.65)",
    cmdBg: "#231F1B",
    radius: "16px",
    radiusSm: "10px",
    radiusXs: "6px",
  },
  light: {
    bg: "#F8F4EF",
    surface: "#FFFFFF",
    surfaceHover: "rgba(0,0,0,0.015)",
    surfaceActive: "rgba(0,0,0,0.03)",
    card: "#FFFFFF",
    border: "#E8DFD4",
    borderSubtle: "#F0E8DD",
    text: "#2C2016",
    textSecondary: "#6B5E4D",
    textMuted: "#9A8E7D",
    textDim: "#BDB3A5",
    textGhost: "#DDD5CA",
    accent: "#C07840",
    accentSoft: "rgba(192,120,64,0.08)",
    green: "#4A9960",
    greenSoft: "rgba(74,153,96,0.06)",
    questionBg: "rgba(192,120,64,0.05)",
    questionBorder: "rgba(192,120,64,0.2)",
    questionText: "#A06030",
    overlay: "rgba(0,0,0,0.2)",
    cmdBg: "#FFFFFF",
    radius: "16px",
    radiusSm: "10px",
    radiusXs: "6px",
  },
};

type P = typeof palette.dark;
const heading = "'Fraunces', serif";
const body = "'Outfit', sans-serif";
const mono = "'Geist Mono', monospace";

function DesignSoftClay() {
  const s = useRelayState();
  const p = s.mode === "dark" ? palette.dark : palette.light;

  return (
    <div className="flex h-screen overflow-hidden select-none" style={{ fontFamily: body, background: p.bg, color: p.text }}>
      <ListPanel s={s} p={p} />
      <div className="flex-1 flex min-w-0 p-3 gap-3">
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
      const colors = ["#7EBF8E", "#D4956A", "#8B9FD4", "#D4A07E", "#B88EC4"];
      proj = { name: customProject.trim(), color: colors[Math.floor(Math.random() * colors.length)] };
    } else { proj = PROJECTS.find((pr) => pr.name === newProjectName) || PROJECTS[0]; }
    s.createConvo(newTitle.trim(), proj);
    setNewTitle(""); setCustomProject(""); setShowCustom(false);
  }

  return (
    <div className="flex flex-col shrink-0 transition-all duration-500"
      style={{ width: hasPanes ? "360px" : "100%", maxWidth: hasPanes ? "360px" : "none", borderRight: hasPanes ? `1px solid ${p.border}` : "none" }}>

      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-[26px] font-normal" style={{ fontFamily: heading, color: p.text, fontVariationSettings: "'opsz' 40, 'SOFT' 100, 'WONK' 1" }}>
            {s.showArchived ? "Archive" : "Relay"}
          </h1>
          <div className="flex items-center gap-2">
            <button type="button" onClick={s.openCmd}
              className="text-[12px] px-3 py-1.5 transition-all"
              style={{ color: p.textMuted, background: p.surfaceHover, borderRadius: p.radiusSm, border: `1px solid ${p.border}` }}>⌘K</button>
            <button type="button" onClick={s.toggleTheme}
              className="w-8 h-8 flex items-center justify-center text-[14px] transition-all"
              style={{ color: p.textMuted, background: p.surfaceHover, borderRadius: "50%", border: `1px solid ${p.border}` }}>
              {s.mode === "dark" ? "☀" : "☾"}
            </button>
            {!s.showArchived && (
              <button type="button" onClick={() => s.setShowNewForm(!s.showNewForm)}
                className="text-[12px] font-medium px-4 py-1.5 transition-all"
                style={{ color: "#fff", background: p.accent, borderRadius: p.radiusSm, boxShadow: `0 2px 8px ${p.accentSoft}` }}>
                New chat
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          {s.thinkingCount > 0 && !s.showArchived && (
            <span className="text-[11px] px-2.5 py-1 animate-pulse" style={{ color: p.textSecondary, background: p.surfaceActive, borderRadius: p.radiusXs }}>{s.thinkingCount} thinking</span>
          )}
          {s.waitingCount > 0 && !s.showArchived && (
            <span className="text-[11px] px-2.5 py-1" style={{ color: p.textDim, background: p.surfaceHover, borderRadius: p.radiusXs }}>{s.waitingCount} waiting</span>
          )}
          {s.questionCount > 0 && !s.showArchived && (
            <span className="text-[11px] px-2.5 py-1" style={{ color: p.questionText, background: p.questionBg, borderRadius: p.radiusXs }}>{s.questionCount} question{s.questionCount > 1 ? "s" : ""}</span>
          )}
        </div>

        {s.showNewForm && !s.showArchived && (
          <div className="mb-4 p-4 animate-fade-up" style={{ background: p.card, border: `1px solid ${p.border}`, borderRadius: p.radius, boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitNew(); if (e.key === "Escape") s.setShowNewForm(false); }}
              placeholder="What should we work on?"
              className="w-full text-[16px] bg-transparent focus:outline-none mb-3 font-light"
              style={{ color: p.text, fontFamily: heading }} autoFocus />
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {PROJECTS.map((pr) => (
                <button key={pr.name} type="button" onClick={() => { setNewProjectName(pr.name); setShowCustom(false); }}
                  className="text-[12px] px-3 py-1.5 transition-all"
                  style={{
                    color: !showCustom && newProjectName === pr.name ? "#fff" : p.textMuted,
                    background: !showCustom && newProjectName === pr.name ? pr.color : p.surfaceHover,
                    borderRadius: p.radiusSm,
                  }}>{pr.name}</button>
              ))}
              <button type="button" onClick={() => setShowCustom(!showCustom)}
                className="text-[12px] px-3 py-1.5 transition-all"
                style={{ color: showCustom ? p.accent : p.textDim, background: showCustom ? p.accentSoft : "transparent", borderRadius: p.radiusSm }}>
                + project
              </button>
            </div>
            {showCustom && (
              <input value={customProject} onChange={(e) => setCustomProject(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitNew(); }}
                placeholder="Project name..."
                className="w-full text-[13px] bg-transparent focus:outline-none mb-3 pb-2"
                style={{ color: p.text, borderBottom: `1px solid ${p.border}` }} autoFocus />
            )}
            <div className="flex justify-end">
              <button type="button" onClick={submitNew} disabled={!newTitle.trim()}
                className="text-[12px] font-medium px-4 py-1.5 transition-all disabled:opacity-25"
                style={{ color: "#fff", background: p.accent, borderRadius: p.radiusSm }}>Create</button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 flex-wrap" style={{ padding: "8px 0" }}>
          <button type="button" onClick={() => { s.setShowArchived(false); s.setFilterProject(null); }}
            className="text-[11px] px-3 py-1.5 transition-all"
            style={{ color: !s.filterProject && !s.showArchived ? p.text : p.textDim, background: !s.filterProject && !s.showArchived ? p.surfaceActive : "transparent", borderRadius: "20px" }}>
            All
          </button>
          {PROJECTS.map((pr) => (
            <button key={pr.name} type="button"
              onClick={() => { s.setShowArchived(false); s.setFilterProject(s.filterProject === pr.name ? null : pr.name); }}
              className="text-[11px] px-3 py-1.5 transition-all flex items-center gap-1.5"
              style={{
                color: s.filterProject === pr.name ? "#fff" : p.textDim,
                background: s.filterProject === pr.name ? pr.color : "transparent",
                borderRadius: "20px",
              }}>
              {s.filterProject !== pr.name && <span className="w-2 h-2 rounded-full" style={{ background: pr.color, opacity: 0.4 }} />}
              {pr.name}
            </button>
          ))}
          <div className="w-px h-4 mx-1" style={{ background: p.border }} />
          {(["thinking", "waiting", "error"] as Status[]).map((st) => (
            <button key={st} type="button" onClick={() => s.setFilterStatus(s.filterStatus === st ? null : st)}
              className="text-[11px] px-3 py-1.5 transition-all"
              style={{ color: s.filterStatus === st ? p.textSecondary : p.textGhost, background: s.filterStatus === st ? p.surfaceActive : "transparent", borderRadius: "20px" }}>
              {st}
            </button>
          ))}
          <div className="w-px h-4 mx-1" style={{ background: p.border }} />
          <button type="button" onClick={() => { s.setShowArchived(!s.showArchived); s.setFilterProject(null); s.setFilterStatus(null); }}
            className="text-[11px] px-3 py-1.5 transition-all"
            style={{ color: s.showArchived ? p.textSecondary : p.textGhost, background: s.showArchived ? p.surfaceActive : "transparent", borderRadius: "20px" }}>
            archived
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-1">
        {s.filtered.map((c) => {
          const isOpen = s.openPanes.includes(c.id);
          const isHov = c.id === hoveredId;
          const isDO = c.id === s.dragOverId;
          const dot = statusDot(c.status);
          return (
            <div key={c.id} className="relative mb-1" draggable={!s.showArchived}
              onDragStart={() => s.handleDragStart(c.id)} onDragOver={(e) => s.handleDragOver(e, c.id)}
              onDrop={() => s.handleDrop(c.id)} onDragEnd={() => {}}
              onMouseEnter={() => setHoveredId(c.id)} onMouseLeave={() => setHoveredId(null)}>
              {isDO && <div className="absolute top-0 left-3 right-3 h-[3px] rounded-full" style={{ background: p.accent }} />}
              <button type="button" onClick={() => s.selectConvo(c.id)}
                className="w-full text-left transition-all duration-200"
                style={{
                  background: isOpen ? p.surfaceActive : isHov ? p.surfaceHover : "transparent",
                  borderRadius: p.radiusSm,
                  padding: "10px 14px",
                }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${dot.cls}`} style={{ background: dot.bg }} />
                    <span className="text-[14px] font-normal truncate" style={{ fontFamily: heading, color: isOpen ? p.text : p.textSecondary }}>
                      {c.title}
                    </span>
                    {c.hasQuestion && (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.questionText }} />
                    )}
                  </div>
                  <span className="text-[10px] shrink-0 ml-2" style={{ color: p.textDim, fontFamily: mono }}>{c.time}</span>
                </div>
                <div className="flex items-center gap-2 pl-[22px]">
                  <span className="text-[11px] px-2 py-0.5 shrink-0"
                    style={{ color: c.project.color, background: `${c.project.color}12`, borderRadius: "20px" }}>{c.project.name}</span>
                  <span className="text-[12px] truncate" style={{ color: p.textDim }}>{c.lastMessage}</span>
                </div>
              </button>
              {isHov && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 animate-fade-in">
                  {s.showArchived ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); s.unarchiveConvo(c.id); }}
                      className="text-[11px] px-3 py-1 transition-all"
                      style={{ color: p.textMuted, background: p.card, borderRadius: p.radiusXs, border: `1px solid ${p.border}`, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>restore</button>
                  ) : (
                    <>
                      <button type="button" onClick={(e) => { e.stopPropagation(); s.toggleTerminal(c.project.name); }}
                        className="text-[11px] px-3 py-1 transition-all"
                        style={{ color: p.textMuted, background: p.card, borderRadius: p.radiusXs, border: `1px solid ${p.border}`, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>term</button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); s.archiveConvo(c.id); }}
                        className="text-[11px] px-3 py-1 transition-all"
                        style={{ color: p.textMuted, background: p.card, borderRadius: p.radiusXs, border: `1px solid ${p.border}`, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>archive</button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {s.filtered.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-[14px]" style={{ color: p.textDim, fontFamily: heading }}>{s.showArchived ? "Nothing archived yet" : "No conversations found"}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ p }: { p: P }) {
  return (
    <div className="flex-1 flex items-center justify-center" style={{ background: p.surface, borderRadius: p.radius }}>
      <div className="text-center animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center" style={{ background: p.surfaceHover, borderRadius: "50%" }}>
          <span className="text-[24px]" style={{ color: p.textGhost }}>◎</span>
        </div>
        <p className="text-[14px] mb-2" style={{ color: p.textDim, fontFamily: heading }}>Pick a conversation</p>
        <p className="text-[12px]" style={{ color: p.textGhost }}>or press <kbd className="px-2 py-0.5" style={{ background: p.surfaceHover, borderRadius: p.radiusXs, border: `1px solid ${p.border}` }}>⌘K</kbd></p>
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
    <div className="flex flex-col min-w-0 animate-slide-in-right overflow-hidden"
      style={{ flex: 1, background: p.surface, borderRadius: p.radius, border: `1px solid ${p.border}`, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
      <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${dot.cls}`} style={{ background: dot.bg }} />
          <span className="text-[16px] truncate" style={{ fontFamily: heading, color: p.text }}>{convo.title}</span>
          <span className="text-[11px] px-2.5 py-0.5 shrink-0" style={{ color: convo.project.color, background: `${convo.project.color}12`, borderRadius: "20px" }}>{convo.project.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onArchive} className="text-[11px] px-2 py-1 transition-colors" style={{ color: p.textDim, borderRadius: p.radiusXs }}>archive</button>
          <button type="button" onClick={onClose} className="w-6 h-6 flex items-center justify-center transition-colors" style={{ color: p.textDim, background: p.surfaceHover, borderRadius: "50%" }}>×</button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-[580px] mx-auto px-6 py-6">
          {convo.messages.map((msg, i) => (
            <div key={msg.id} className="mb-6" style={{ animation: i === convo.messages.length - 1 ? "fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both" : "none" }}>
              {msg.role === "user" ? (
                <div className="inline-block px-4 py-2.5" style={{ background: p.surfaceActive, borderRadius: p.radiusSm }}>
                  <p className="text-[14px] leading-[1.7]" style={{ color: p.textSecondary }}>{msg.content}</p>
                </div>
              ) : (
                <p className="text-[14px] leading-[1.8] pl-1" style={{ color: p.text }}>{msg.content}</p>
              )}
            </div>
          ))}
          {convo.hasQuestion && convo.questionText && (
            <div className="mb-6 p-4 animate-scale-in" style={{ background: p.questionBg, border: `1px solid ${p.questionBorder}`, borderRadius: p.radius }}>
              <p className="text-[13px] mb-3 leading-relaxed" style={{ color: p.questionText }}>{convo.questionText}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {convo.questionOptions?.map((opt) => (
                  <button key={opt} type="button" onClick={() => onAnswer(opt)}
                    className="text-[12px] px-3.5 py-1.5 transition-all"
                    style={{ color: p.questionText, border: `1px solid ${p.questionBorder}`, borderRadius: "20px", background: "transparent" }}>{opt}</button>
                ))}
              </div>
            </div>
          )}
          {isThinking && (
            <div className="animate-fade-in flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: p.textDim, animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: p.textDim, animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: p.textDim, animationDelay: "300ms" }} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-5 py-4" style={{ borderTop: `1px solid ${p.border}` }}>
        <div className="max-w-[580px] mx-auto">
          {queued.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] px-2.5 py-0.5" style={{ color: p.textDim, background: p.surfaceHover, borderRadius: "20px" }}>{queued.length} queued</span>
            </div>
          )}
          <div className="flex items-end gap-2" style={{ background: p.bg, borderRadius: p.radiusSm, padding: "10px 14px", border: `1px solid ${p.border}` }}>
            <textarea ref={inputRef} value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={isThinking ? "Will be queued..." : "Type a message..."}
              rows={1} className="flex-1 text-[14px] focus:outline-none resize-none bg-transparent"
              style={{ color: p.text, caretColor: p.accent }} />
            <button type="button" onClick={send} disabled={!input.trim()}
              className="w-8 h-8 flex items-center justify-center transition-all disabled:opacity-20 shrink-0"
              style={{ background: p.accent, borderRadius: "50%", color: "#fff" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          {isThinking && <p className="text-[11px] mt-1.5 text-center animate-pulse-soft" style={{ color: p.textDim }}>Thinking...</p>}
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
        style={{ background: p.cmdBg, borderRadius: p.radius, border: `1px solid ${p.border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${p.border}` }}>
          <span className="text-[16px]" style={{ color: p.textDim }}>◎</span>
          <input ref={s.cmdInputRef} value={s.cmdQuery} onChange={(e) => s.setCmdQuery(e.target.value)} onKeyDown={onKey}
            placeholder="Search everything..." className="flex-1 text-[15px] bg-transparent focus:outline-none"
            style={{ color: p.text, caretColor: p.accent, fontFamily: body }} />
          <kbd className="text-[10px] px-2 py-0.5" style={{ color: p.textDim, background: p.surfaceHover, borderRadius: p.radiusXs }}>esc</kbd>
        </div>
        <div className="max-h-[380px] overflow-y-auto py-2">
          {s.cmdResults.length === 0 && <div className="px-5 py-8 text-center"><p className="text-[14px]" style={{ color: p.textDim, fontFamily: heading }}>No results</p></div>}
          {s.cmdResults.map((r: CmdResult, i: number) => {
            const sel = i === idx;
            if (r.type === "chat") {
              const dot = statusDot(r.convo.status);
              return (
                <button key={`c-${r.convo.id}`} type="button" onClick={() => { s.selectConvo(r.convo.id); s.closeCmd(); }}
                  className="w-full text-left px-5 py-2.5 flex items-center gap-3 transition-all"
                  style={{ background: sel ? p.surfaceActive : "transparent", borderRadius: sel ? p.radiusXs : "0" }}
                  onMouseEnter={() => setIdx(i)}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${dot.cls}`} style={{ background: dot.bg }} />
                  <span className="text-[14px] truncate flex-1" style={{ fontFamily: heading, color: p.textSecondary }}>{r.convo.title}</span>
                  <span className="text-[11px] px-2 py-0.5 shrink-0" style={{ color: r.convo.project.color, background: `${r.convo.project.color}10`, borderRadius: "20px" }}>{r.convo.project.name}</span>
                </button>
              );
            }
            if (r.type === "project") {
              return (
                <button key={`p-${r.project.name}`} type="button" onClick={() => { s.setFilterProject(r.project.name); s.closeCmd(); }}
                  className="w-full text-left px-5 py-2.5 flex items-center gap-3 transition-all"
                  style={{ background: sel ? p.surfaceActive : "transparent" }} onMouseEnter={() => setIdx(i)}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.project.color }} />
                  <span className="text-[14px]" style={{ fontFamily: heading, color: p.textSecondary }}>{r.project.name}</span>
                  <span className="text-[11px]" style={{ color: p.textDim }}>project</span>
                </button>
              );
            }
            return (
              <button key={`a-${r.label}`} type="button" onClick={() => { r.action(); s.closeCmd(); }}
                className="w-full text-left px-5 py-2.5 flex items-center gap-3 transition-all"
                style={{ background: sel ? p.surfaceActive : "transparent" }} onMouseEnter={() => setIdx(i)}>
                <span className="text-[13px]" style={{ color: p.accent }}>→</span>
                <span className="text-[14px]" style={{ color: p.textSecondary }}>{r.label}</span>
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
    <div className="fixed inset-x-4 bottom-4 z-40 animate-slide-up overflow-hidden" style={{ height: "220px", borderRadius: p.radius, border: `1px solid ${p.border}`, boxShadow: "0 8px 30px rgba(0,0,0,0.1)" }}>
      <div className="h-full flex flex-col" style={{ background: p.surface }}>
        <div className="flex items-center justify-between px-5 h-10 shrink-0" style={{ borderBottom: `1px solid ${p.border}` }}>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium" style={{ color: p.textMuted, fontFamily: mono }}>terminal</span>
            <span className="text-[11px] px-2 py-0.5" style={{ color: p.textDim, background: p.surfaceHover, borderRadius: "20px" }}>{project}</span>
          </div>
          <button type="button" onClick={onClose} className="w-6 h-6 flex items-center justify-center" style={{ color: p.textDim, background: p.surfaceHover, borderRadius: "50%" }}>×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {lines.map((line, i) => (
            <div key={i} className="text-[12px] leading-[1.8]" style={{ color: line.startsWith("$") ? p.textSecondary : p.textDim, fontFamily: mono }}>{line || "\u00A0"}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FloatingQ({ p, convo, onAnswer, onOpen }: { p: P; convo: Convo; onAnswer: (a: string) => void; onOpen: () => void }) {
  const dot = statusDot(convo.status);
  return (
    <div className="animate-slide-in-right" style={{ background: p.card, border: `1px solid ${p.questionBorder}`, borderRadius: p.radius, padding: "16px", boxShadow: "0 8px 30px rgba(0,0,0,0.1)" }}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className={`w-2 h-2 rounded-full ${dot.cls}`} style={{ background: dot.bg }} />
        <button type="button" onClick={onOpen} className="text-[14px] truncate" style={{ fontFamily: heading, color: p.text }}>{convo.title}</button>
        <span className="text-[11px] px-2 py-0.5 shrink-0" style={{ color: convo.project.color, background: `${convo.project.color}10`, borderRadius: "20px" }}>{convo.project.name}</span>
      </div>
      <p className="text-[12px] leading-relaxed mb-3" style={{ color: p.questionText }}>{convo.questionText}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {convo.questionOptions?.map((opt) => (
          <button key={opt} type="button" onClick={() => onAnswer(opt)}
            className="text-[11px] px-3 py-1.5 transition-all"
            style={{ color: p.questionText, border: `1px solid ${p.questionBorder}`, borderRadius: "20px", background: "transparent" }}>{opt}</button>
        ))}
      </div>
    </div>
  );
}
