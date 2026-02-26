import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { SEED_CONVOS, PROJECTS, type Convo, type Status, type Project } from "./design-data";

export type CmdResult =
  | { type: "chat"; convo: Convo }
  | { type: "project"; project: Project }
  | { type: "action"; label: string; action: () => void };

export function useRelayState() {
  const [convos, setConvos] = useState<Convo[]>(() => SEED_CONVOS.map((c, i) => ({ ...c, order: i })));
  const [openPanes, setOpenPanes] = useState<string[]>([]);
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<Status | null>(null);
  const [showCmd, setShowCmd] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [terminalProject, setTerminalProject] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const cmdInputRef = useRef<HTMLInputElement>(null);

  const toggleTheme = useCallback(() => setMode((m) => (m === "dark" ? "light" : "dark")), []);

  const activeConvos = useMemo(() => convos.filter((c) => !c.archived), [convos]);
  const archivedConvos = useMemo(() => convos.filter((c) => c.archived), [convos]);

  const filtered = useMemo(() => {
    const list = showArchived ? archivedConvos : activeConvos;
    return list
      .filter((c) => !filterProject || c.project.name === filterProject)
      .filter((c) => !filterStatus || c.status === filterStatus)
      .sort((a, b) => {
        if (!showArchived) {
          const order: Record<Status, number> = { thinking: 0, waiting: 1, error: 2, idle: 3 };
          const statusDiff = order[a.status] - order[b.status];
          if (statusDiff !== 0) return statusDiff;
        }
        return (a.order ?? 0) - (b.order ?? 0);
      });
  }, [activeConvos, archivedConvos, filterProject, filterStatus, showArchived]);

  useEffect(() => {
    const questionsInOpenPanes = new Set(openPanes);
    const floating = convos
      .filter((c) => c.hasQuestion && !c.archived && !questionsInOpenPanes.has(c.id))
      .map((c) => c.id);
    setNotifications(floating);
  }, [convos, openPanes]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCmd(true);
        setTimeout(() => cmdInputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") {
        if (showCmd) setShowCmd(false);
        if (showNewForm) setShowNewForm(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCmd, showNewForm]);

  function selectConvo(id: string) {
    setOpenPanes((prev) => {
      if (prev.includes(id)) return prev;
      if (prev.length === 0) return [id];
      if (prev.length === 1) return [...prev, id];
      return [prev[1], id];
    });
  }

  function closePane(id: string) {
    setOpenPanes((prev) => prev.filter((p) => p !== id));
  }

  function archiveConvo(id: string) {
    setConvos((prev) => prev.map((c) => (c.id === id ? { ...c, archived: true } : c)));
    setOpenPanes((prev) => prev.filter((p) => p !== id));
  }

  function unarchiveConvo(id: string) {
    setConvos((prev) => prev.map((c) => (c.id === id ? { ...c, archived: false } : c)));
  }

  function sendMessage(convoId: string, text: string) {
    setConvos((prev) =>
      prev.map((c) =>
        c.id === convoId
          ? {
              ...c,
              messages: [...c.messages, { id: crypto.randomUUID(), role: "user" as const, content: text }],
              lastMessage: text,
              status: "thinking" as Status,
            }
          : c,
      ),
    );
    setTimeout(() => {
      setConvos((prev) =>
        prev.map((c) =>
          c.id === convoId && c.status === "thinking"
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  { id: crypto.randomUUID(), role: "assistant" as const, content: "Got it. Working on that now..." },
                ],
                lastMessage: "Got it. Working on that now...",
                status: "idle" as Status,
              }
            : c,
        ),
      );
    }, 2000);
  }

  function answerQuestion(convoId: string, answer: string) {
    setConvos((prev) =>
      prev.map((c) =>
        c.id === convoId
          ? {
              ...c,
              hasQuestion: false,
              questionText: undefined,
              questionOptions: undefined,
              messages: [...c.messages, { id: crypto.randomUUID(), role: "user" as const, content: answer }],
              lastMessage: answer,
            }
          : c,
      ),
    );
  }

  function handleDragStart(id: string) {
    setDragId(id);
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    setDragOverId(id);
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    setConvos((prev) => {
      const items = [...prev];
      const dragIdx = items.findIndex((c) => c.id === dragId);
      const targetIdx = items.findIndex((c) => c.id === targetId);
      if (dragIdx === -1 || targetIdx === -1) return prev;
      const [moved] = items.splice(dragIdx, 1);
      items.splice(targetIdx, 0, moved);
      return items.map((c, i) => ({ ...c, order: i }));
    });
    setDragId(null);
    setDragOverId(null);
  }

  function createConvo(title: string, project: Project) {
    const c: Convo = {
      id: crypto.randomUUID(),
      title,
      project,
      status: "idle",
      lastMessage: "New conversation",
      time: "now",
      messages: [],
      order: 0,
    };
    setConvos((prev) => [c, ...prev.map((x, i) => ({ ...x, order: i + 1 }))]);
    selectConvo(c.id);
    setShowNewForm(false);
  }

  function openCmd() {
    setShowCmd(true);
    setTimeout(() => cmdInputRef.current?.focus(), 50);
  }

  function closeCmd() {
    setShowCmd(false);
    setCmdQuery("");
  }

  function toggleTerminal(projectName: string) {
    setTerminalProject(terminalProject === projectName ? null : projectName);
  }

  const cmdResults = useMemo((): CmdResult[] => {
    if (!cmdQuery.trim()) {
      return [
        ...convos.slice(0, 5).map((c) => ({ type: "chat" as const, convo: c })),
        ...PROJECTS.map((p) => ({ type: "project" as const, project: p })),
        { type: "action" as const, label: "New conversation", action: () => setShowNewForm(true) },
        { type: "action" as const, label: "Toggle theme", action: toggleTheme },
        { type: "action" as const, label: "Show archived", action: () => setShowArchived(true) },
      ];
    }
    const q = cmdQuery.toLowerCase();
    const chatResults = convos
      .filter((c) => c.title.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q) || c.project.name.toLowerCase().includes(q))
      .map((c) => ({ type: "chat" as const, convo: c }));
    const projectResults = PROJECTS.filter((p) => p.name.toLowerCase().includes(q)).map((p) => ({ type: "project" as const, project: p }));
    return [...chatResults, ...projectResults];
  }, [cmdQuery, convos, toggleTheme]);

  const thinkingCount = activeConvos.filter((c) => c.status === "thinking").length;
  const waitingCount = activeConvos.filter((c) => c.status === "waiting").length;
  const questionCount = convos.filter((c) => c.hasQuestion && !c.archived).length;

  return {
    convos,
    filtered,
    openPanes,
    filterProject,
    setFilterProject,
    filterStatus,
    setFilterStatus,
    showCmd,
    cmdQuery,
    setCmdQuery,
    showNewForm,
    setShowNewForm,
    showArchived,
    setShowArchived,
    terminalProject,
    dragOverId,
    notifications,
    mode,
    toggleTheme,
    cmdInputRef,
    thinkingCount,
    waitingCount,
    questionCount,
    selectConvo,
    closePane,
    archiveConvo,
    unarchiveConvo,
    sendMessage,
    answerQuestion,
    handleDragStart,
    handleDragOver,
    handleDrop,
    createConvo,
    openCmd,
    closeCmd,
    toggleTerminal,
    cmdResults,
    setNotifications,
  };
}

export function usePaneInput(convoStatus: Status, onSend: (text: string) => void) {
  const [input, setInput] = useState("");
  const [queued, setQueued] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isThinking = convoStatus === "thinking";

  function send() {
    const text = input.trim();
    if (!text) return;
    if (isThinking) {
      setQueued((prev) => [...prev, text]);
    } else {
      onSend(text);
    }
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }

  useEffect(() => {
    if (!isThinking && queued.length > 0) {
      const [next, ...rest] = queued;
      setQueued(rest);
      onSend(next);
    }
  }, [isThinking, queued, onSend]);

  return { input, setInput, queued, inputRef, isThinking, send };
}
