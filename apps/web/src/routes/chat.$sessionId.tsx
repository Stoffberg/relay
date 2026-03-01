import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSpacetimeDB } from "spacetimedb/react";
import { tables } from "../spacetime";
import type { DbConnection, Session, Message, MessagePart, ToolCommand, ToolResult, Verification } from "../spacetime";
import { ModelSelector } from "../components/model-selector";
import { SystemPromptEditor } from "../components/system-prompt-editor";
import { buildChatMessages, computeStatus, type ChatMessage, type SessionStatus } from "../lib/chat-store";
import { MessageRow, ThinkingIndicator } from "../components/message-row";
import { InputBar } from "../components/input-bar";
import { useRows, useSubscriptionReady } from "../hooks/use-rows";

type SubscriptionHandle = { unsubscribe(): void; isEnded(): boolean };

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const Route = createFileRoute("/chat/$sessionId")({
  component: ChatPage,
  errorComponent: ({ error }) => (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-sm">
        <p className="text-[15px] font-medium text-body">Something went wrong</p>
        <p className="text-[13px] text-muted mt-2">{error?.message ?? "An unexpected error occurred"}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 text-[13px] bg-surface-hover text-body rounded-md hover:bg-surface-active transition-colors"
        >
          Reload
        </button>
      </div>
    </div>
  ),
});

const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,100}$/;

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function ChatPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const isValidSession = SESSION_ID_RE.test(sessionId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userNearBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const { isActive, getConnection } = useSpacetimeDB();
  const subscriptionReady = useSubscriptionReady();
  const [sessionSubReady, setSessionSubReady] = useState(false);

  useEffect(() => {
    const conn = getConnection() as DbConnection | null;
    if (!conn || !isActive || !subscriptionReady) return;

    setSessionSubReady(false);
    const handle: SubscriptionHandle = conn.subscriptionBuilder()
      .onApplied(() => {
        console.log(`[relay] session subscription applied: ${sessionId}`);
        setSessionSubReady(true);
      })
      .subscribe([
        `SELECT * FROM message WHERE session_id = '${sessionId}'`,
        `SELECT mp.* FROM message_part mp JOIN message m ON mp.message_id = m.id WHERE m.session_id = '${sessionId}'`,
        `SELECT * FROM tool_command WHERE session_id = '${sessionId}'`,
        `SELECT tr.* FROM tool_result tr JOIN tool_command tc ON tr.tool_command_id = tc.id WHERE tc.session_id = '${sessionId}'`,
        `SELECT * FROM verification WHERE session_id = '${sessionId}'`,
      ]);

    return () => {
      if (!handle.isEnded()) {
        handle.unsubscribe();
      }
    };
  }, [sessionId, getConnection, isActive, subscriptionReady]);

  const allMessages = useRows<Message>(tables.message);
  const allParts = useRows<MessagePart>(tables.message_part);
  const allCommands = useRows<ToolCommand>(tables.tool_command);
  const allResults = useRows<ToolResult>(tables.tool_result);
  const allVerifications = useRows<Verification>(tables.verification);
  const allSessions = useRows<Session>(tables.session);
  const allAgents = useRows<{ id: string; status: string; ownerToken: string }>(tables.agent);

  const [ownerToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("relay-owner-token") || "";
  });

  const ready = isActive && subscriptionReady && sessionSubReady;

  const currentSession = useMemo(
    () => (allSessions as Session[]).find((s) => s.id === sessionId),
    [allSessions, sessionId],
  );
  const sessionStatus: SessionStatus = (currentSession?.status as SessionStatus) || "idle";
  const sessionTitle = currentSession?.title || "New conversation";
  const sessionModel = currentSession?.model ?? null;
  const sessionSystemPrompt = currentSession?.systemPrompt ?? null;
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);

  const chatMessages = useMemo(
    () => buildChatMessages(allMessages as Message[], allParts as MessagePart[], allCommands as ToolCommand[], allResults as ToolResult[], sessionId, optimisticMessages),
    [allMessages, allParts, allCommands, allResults, sessionId, optimisticMessages],
  );

  const verificationsByMessageId = useMemo(() => {
    const map = new Map<string, Verification>();
    for (const v of allVerifications as Verification[]) {
      if (v.sessionId === sessionId) {
        map.set(v.messageId, v);
      }
    }
    return map;
  }, [allVerifications, sessionId]);

  const hasOptimistic = optimisticMessages.length > 0;
  const { showThinking, sessionStatus: computedSessionStatus } = useMemo(
    () => computeStatus(sessionStatus, chatMessages, hasOptimistic),
    [sessionStatus, chatMessages, hasOptimistic],
  );

  useEffect(() => {
    const confirmedIds = new Set((allMessages as Message[]).filter(m => m.sessionId === sessionId).map(m => m.id));
    setOptimisticMessages(prev => prev.filter(opt => !confirmedIds.has(opt.id)));
  }, [allMessages, sessionId]);

  const tokenTotals = useMemo(() => {
    let completion = 0;
    for (const msg of chatMessages) {
      if (msg.completionTokens) completion += msg.completionTokens;
    }
    return { completion, total: completion };
  }, [chatMessages]);

  const queuedCount = useMemo(() => {
    let count = 0;
    for (const msg of chatMessages) {
      if (msg.status === "queued" || msg.status === "optimistic") count++;
    }
    return count;
  }, [chatMessages]);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (!force && !userNearBottomRef.current) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: force ? "instant" : "smooth",
      });
    });
  }, []);

  useEffect(() => {
    if (userNearBottomRef.current) {
      scrollToBottom();
    }
  }, [chatMessages.length, scrollToBottom]);

  const searchMatches = useMemo(() => {
    if (!searchOpen || !searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const matches: number[] = [];
    for (let i = 0; i < chatMessages.length; i++) {
      if (chatMessages[i].content?.toLowerCase().includes(q)) matches.push(i);
    }
    return matches;
  }, [searchOpen, searchQuery, chatMessages]);
  const [searchIdx, setSearchIdx] = useState(0);

  useEffect(() => {
    setInput("");
    setOptimisticMessages([]);
    abortRef.current?.abort();
    abortRef.current = null;
  }, [sessionId]);

  const unreadRef = useRef(false);
  useEffect(() => {
    const title = sessionTitle;
    const prefix = unreadRef.current && document.hidden ? "(new) " : "";
    document.title = `${prefix}${title} | Relay`;
    return () => { document.title = "Relay"; };
  }, [sessionTitle, chatMessages.length]);

  useEffect(() => {
    if (computedSessionStatus === "idle" && chatMessages.length > 0 && document.hidden) {
      unreadRef.current = true;
      document.title = `(new) ${sessionTitle} | Relay`;
    }
  }, [computedSessionStatus, chatMessages.length, sessionTitle]);

  useEffect(() => {
    function clearUnread() {
      if (!document.hidden && unreadRef.current) {
        unreadRef.current = false;
        document.title = `${sessionTitle} | Relay`;
      }
    }
    document.addEventListener("visibilitychange", clearUnread);
    return () => document.removeEventListener("visibilitychange", clearUnread);
  }, [sessionTitle]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        const el = document.querySelector<HTMLTextAreaElement>("[data-chat-input]");
        el?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  const [otherTabActive, setOtherTabActive] = useState(false);

  useEffect(() => {
    const channel = new BroadcastChannel("relay-session");
    channel.postMessage({ type: "open", sessionId });
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "open" && e.data?.sessionId === sessionId) {
        setOtherTabActive(true);
      }
      if (e.data?.type === "close" && e.data?.sessionId === sessionId) {
        setOtherTabActive(false);
      }
    }
    channel.addEventListener("message", onMessage);
    return () => {
      channel.postMessage({ type: "close", sessionId });
      channel.removeEventListener("message", onMessage);
      channel.close();
    };
  }, [sessionId]);

  const hasAgent = useMemo(() => allAgents.some(a => a.status === "online" && a.ownerToken === ownerToken), [allAgents, ownerToken]);

  const virtualizer = useVirtualizer({
    count: chatMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  const addOptimistic = useCallback((msg: ChatMessage) => {
    setOptimisticMessages(prev => [...prev, msg]);
  }, []);

  const removeOptimistic = useCallback((id: string) => {
    setOptimisticMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  const doSend = useCallback(async (text: string) => {
    if (!text) return;

    const userMsgId = crypto.randomUUID();
    setInput("");

    addOptimistic({
      id: userMsgId,
      role: "user",
      content: text,
      status: "optimistic",
    });
    userNearBottomRef.current = true;
    scrollToBottom(true);

    const ownerToken = localStorage.getItem("relay-owner-token") || "";
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
          user_message_id: userMsgId,
          owner_token: ownerToken,
        }),
      });

      if (!res.ok) {
        let errorMsg = `Request failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) errorMsg = body.error;
        } catch {}
        removeOptimistic(userMsgId);
        addOptimistic({
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${errorMsg}`,
          status: "error",
          retryText: text,
        });
        return;
      }

      const data = (await res.json()) as { error?: string };
      if (data.error) {
        removeOptimistic(userMsgId);
        addOptimistic({
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${data.error}`,
          status: "error",
          retryText: text,
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      removeOptimistic(userMsgId);
      addOptimistic({
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Network error: ${String(err)}`,
        status: "error",
        retryText: text,
      });
    }
  }, [sessionId, scrollToBottom, addOptimistic, removeOptimistic]);

  const sendMessage = useCallback(() => {
    doSend(input.trim());
  }, [input, doSend]);

  const handleStop = useCallback(() => {
    fetch(`${API_URL}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(err => console.error("[relay] stop request failed:", err));
  }, [sessionId]);

  useEffect(() => {
    function onRetry(e: Event) {
      const detail = (e as CustomEvent).detail as { text: string; errorId: string };
      removeOptimistic(detail.errorId);
      doSend(detail.text);
    }
    window.addEventListener("relay:retry", onRetry);
    return () => window.removeEventListener("relay:retry", onRetry);
  }, [doSend, removeOptimistic]);

  const exportConversation = useCallback(() => {
    const title = sessionTitle;
    const lines: string[] = [`# ${title}`, `Exported: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, ""];

    for (const msg of chatMessages) {
      const role = msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : "Tool";
      lines.push(`## ${role}`);
      if (msg.content) lines.push("", msg.content);
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          lines.push("", `### Tool: ${tc.toolName}`, `**Args:** \`${tc.toolArgs}\``);
          if (tc.output) lines.push("**Output:**", "```", tc.output, "```");
          if (tc.error) lines.push("**Error:**", "```", tc.error, "```");
        }
      }
      lines.push("");
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    a.href = url;
    a.download = `relay-${slug}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessionTitle, chatMessages]);

  if (!isValidSession) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm">
          <p className="text-[15px] font-medium text-body">Invalid session</p>
          <p className="text-[13px] text-muted mt-2">Session ID must be alphanumeric (dashes and underscores allowed), up to 100 characters.</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[13px] text-muted">Loading conversation...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {computedSessionStatus === "error" && (
        <div className="shrink-0 px-6 py-2 flex items-center justify-between bg-danger-soft border-b border-danger/20">
          <span className="text-[12px] text-danger">Session encountered an error</span>
          <button
            type="button"
            onClick={() => {
              const conn = getConnection() as DbConnection | null;
              if (conn) conn.reducers.updateSessionStatus({ sessionId, status: "idle" });
            }}
            className="text-[11px] font-medium px-3 py-1 rounded-[4px] bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
          >
            Reset
          </button>
        </div>
      )}
      {otherTabActive && (
        <div className="shrink-0 px-6 py-1.5 text-center bg-surface-hover border-b border-border">
          <span className="text-[11px] font-mono text-dim">This session is open in another tab</span>
        </div>
      )}
      <div className="shrink-0 px-3 md:px-6 py-2 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("relay:toggle-sidebar"))}
            aria-label="Toggle sidebar"
            className="hidden md:flex items-center justify-center w-6 h-6 shrink-0 text-[14px] text-muted hover:text-foreground transition-colors rounded-[4px] hover:bg-surface-hover"
          >
            ‹
          </button>
          <h2 className="text-[13px] font-medium text-body truncate">
            {sessionTitle}
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <ModelSelector sessionId={sessionId} currentModel={sessionModel} />
          <button
            type="button"
            onClick={() => setShowSystemPrompt(prev => !prev)}
            aria-label="Edit system prompt"
            className={`text-[10px] font-mono transition-colors ${sessionSystemPrompt ? "text-accent" : "text-dim hover:text-muted"}`}
          >
            {sessionSystemPrompt ? "prompt*" : "prompt"}
          </button>
          <span className="text-[10px] font-mono text-dim">
            {chatMessages.length > 0 ? `${chatMessages.length} msg` : ""}
            {tokenTotals.total > 0 ? ` · ${formatTokenCount(tokenTotals.total)} tok` : ""}
          </span>
          <button
            type="button"
            onClick={exportConversation}
            aria-label="Export conversation"
            className="text-[10px] font-mono text-dim hover:text-muted transition-colors"
          >
            ↓
          </button>
          <AgentIndicator hasAgent={hasAgent} />
        </div>
      </div>
      {showSystemPrompt && (
        <SystemPromptEditor
          sessionId={sessionId}
          currentPrompt={sessionSystemPrompt}
          onClose={() => setShowSystemPrompt(false)}
        />
      )}
      {searchOpen && (
        <div className="shrink-0 px-3 md:px-6 py-2 border-b border-border flex items-center gap-2">
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); }
              if (e.key === "Enter" && searchMatches.length > 0) {
                const next = e.shiftKey ? (searchIdx - 1 + searchMatches.length) % searchMatches.length : (searchIdx + 1) % searchMatches.length;
                setSearchIdx(next);
                virtualizer.scrollToIndex(searchMatches[next], { align: "center" });
              }
            }}
            placeholder="Search messages..."
            aria-label="Search messages"
            className="flex-1 text-[13px] bg-transparent text-foreground focus:outline-none caret-accent placeholder:text-dim"
          />
          {searchQuery && (
            <span className="text-[10px] font-mono text-muted shrink-0">
              {searchMatches.length > 0 ? `${searchIdx + 1}/${searchMatches.length}` : "0 results"}
            </span>
          )}
          <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(""); }} className="text-dim hover:text-muted text-[11px]" aria-label="Close search">✕</button>
        </div>
      )}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={() => {
          const near = isNearBottom();
          userNearBottomRef.current = near;
          setShowScrollBtn(!near);
        }}
      >
        <div className="max-w-[1060px] mx-auto px-3 py-4 md:px-6 md:py-6 relative">
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="md:hidden flex items-center gap-1 text-[12px] font-mono text-muted hover:text-foreground transition-colors mb-2"
            aria-label="Back to conversations"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3l-5 4 5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back
          </button>
          {chatMessages.length === 0 && !showThinking && <EmptyState onSuggestion={doSend} hasAgent={hasAgent} />}

          {chatMessages.length > 0 && (
            <div
              style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={chatMessages[virtualRow.index].id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="mb-6">
                    <MessageRow msg={chatMessages[virtualRow.index]} verification={verificationsByMessageId.get(chatMessages[virtualRow.index].id)} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {showThinking && computedSessionStatus === "idle" && (
            <div className="pl-[18px] animate-fade-in" role="status">
              <div className="flex gap-2 items-center pl-4">
                <div className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" />
                <span className="text-[12px] font-mono text-dim">in queue...</span>
              </div>
            </div>
          )}
          {showThinking && computedSessionStatus !== "idle" && <ThinkingIndicator />}

          {computedSessionStatus === "waiting_for_tool" && (
            <div className="pl-[18px] animate-fade-in">
              <div className="flex gap-2 items-center pl-4">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span className="text-[12px] font-mono text-muted">running tools...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {computedSessionStatus === "streaming" && "Relay is responding"}
        {computedSessionStatus === "waiting_for_tool" && "Running tools"}
        {computedSessionStatus === "idle" && chatMessages.length > 0 && "Response complete"}
      </div>

      <div className="relative">
        {showScrollBtn && (
          <button
            type="button"
            onClick={() => { scrollToBottom(true); setShowScrollBtn(false); }}
            className="absolute -top-12 left-1/2 -translate-x-1/2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-surface border border-border text-muted hover:text-foreground hover:bg-surface-hover transition-all shadow-md animate-fade-in"
            aria-label="Scroll to bottom"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {queuedCount > 0 && (
          <div className="text-center py-1">
            <span className="text-[10px] font-mono text-muted">{queuedCount} message{queuedCount !== 1 ? "s" : ""} queued</span>
          </div>
        )}
        <InputBar
          input={input}
          onInputChange={setInput}
          onSend={sendMessage}
          onStop={handleStop}
          disabled={!ready}
          showThinking={showThinking}
          ready={ready}
          sessionId={sessionId}
          sessionStatus={computedSessionStatus}
        />
      </div>
    </div>
  );
}

function AgentIndicator({ hasAgent }: { hasAgent: boolean }) {
  const [showPopover, setShowPopover] = useState(false);

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setShowPopover(prev => !prev)}
        className="flex items-center gap-1 hover:bg-surface-hover px-1.5 py-0.5 rounded-[4px] transition-colors"
      >
        <span className={`w-[5px] h-[5px] rounded-full ${hasAgent ? "bg-green-500" : "bg-dim"}`} />
        <span className="text-[10px] font-mono text-muted">{hasAgent ? "agent" : "no agent"}</span>
      </button>
      {showPopover && (
        <AgentStatusPopover hasAgent={hasAgent} onClose={() => setShowPopover(false)} />
      )}
    </span>
  );
}

type DetectedPlatform = { os: "macos" | "linux" | "windows" | "unknown"; label: string };

function detectPlatform(): DetectedPlatform {
  if (typeof navigator === "undefined") return { os: "unknown", label: "your platform" };
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return { os: "macos", label: "macOS" };
  if (ua.includes("linux")) return { os: "linux", label: "Linux" };
  if (ua.includes("win")) return { os: "windows", label: "Windows" };
  return { os: "unknown", label: "your platform" };
}

function AgentSetupGuide({ inline }: { inline?: boolean }) {
  const [ownerToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("relay-owner-token") || "";
  });
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [platform] = useState(detectPlatform);

  const copyText = (text: string, step: number) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedStep(step);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  const installCommand = platform.os === "windows"
    ? "wsl curl -fsSL https://code.stoff.dev/install.sh | sh"
    : "curl -fsSL https://code.stoff.dev/install.sh | sh";

  const steps = [
    {
      label: "Install",
      description: platform.os === "windows" ? "Via WSL" : `For ${platform.label}`,
      command: installCommand,
    },
    {
      label: "Connect",
      description: "Link the agent to your account",
      command: `relay setup --token ${ownerToken}`,
    },
    {
      label: "Start",
      description: "Run the agent in your project directory",
      command: "relay start",
    },
  ];

  const containerClass = inline
    ? "text-left"
    : "text-left mt-2";

  return (
    <div className={containerClass}>
      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={step.label} className="group">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-medium text-accent w-4 text-right">{i + 1}</span>
              <span className="text-[12px] font-medium text-body">{step.label}</span>
              <span className="text-[11px] text-dim">{step.description}</span>
            </div>
            <div className="ml-6">
              <div className="flex items-center gap-1.5">
                <code className="flex-1 text-[11px] font-mono px-2.5 py-1.5 bg-surface-hover border border-border-subtle rounded-[4px] text-muted overflow-x-auto whitespace-nowrap">
                  {step.command}
                </code>
                <button
                  type="button"
                  onClick={() => copyText(step.command, i)}
                  className="shrink-0 text-[10px] font-mono px-2 py-1.5 text-dim hover:text-muted transition-colors"
                >
                  {copiedStep === i ? "✓" : "copy"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {platform.os === "windows" && (
        <p className="text-[10px] text-dim mt-3">
          Relay requires WSL (Windows Subsystem for Linux) on Windows.
        </p>
      )}
    </div>
  );
}

function AgentStatusPopover({ hasAgent, onClose }: { hasAgent: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-2 z-40 w-[340px] bg-cmd border border-border rounded-[8px] animate-scale-in"
      style={{ boxShadow: "0 12px 32px rgba(0,0,0,0.3)" }}
    >
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-[6px] h-[6px] rounded-full ${hasAgent ? "bg-green-500" : "bg-dim"}`} />
          <span className="text-[13px] font-medium text-foreground">
            {hasAgent ? "Agent connected" : "Agent not connected"}
          </span>
        </div>
        <button type="button" onClick={onClose} className="text-[10px] text-dim hover:text-muted">✕</button>
      </div>
      <div className="px-4 py-3">
        {hasAgent ? (
          <p className="text-[12px] text-body">
            Your local agent is running and connected. It can read files, execute commands, and interact with your codebase.
          </p>
        ) : (
          <div>
            <p className="text-[12px] text-body mb-3">
              The agent runs on your machine and gives Relay access to your files, terminal, and codebase. Set it up in three steps:
            </p>
            <AgentSetupGuide inline />
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onSuggestion, hasAgent }: { onSuggestion: (text: string) => Promise<void> | void; hasAgent: boolean }) {
  const [isFirstVisit] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("relay-has-chatted") !== "true";
  });
  const [showSetup, setShowSetup] = useState(false);

  const agentSuggestions = [
    { text: "Read my project's README", icon: "📄" },
    { text: "Find all TODO comments in the codebase", icon: "🔍" },
    { text: "Run my test suite and summarize results", icon: "🧪" },
  ];
  const chatSuggestions = [
    { text: "What can you help me with?", icon: "💡" },
    { text: "Write a fizzbuzz in Rust", icon: "🦀" },
    { text: "Explain async/await simply", icon: "⚡" },
  ];
  const suggestions = hasAgent ? agentSuggestions : chatSuggestions;

  if (isFirstVisit && !hasAgent) {
    return (
      <div className="py-12 sm:py-16 animate-fade-in max-w-[520px] mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-[36px] font-bold text-foreground tracking-[-0.03em] mb-2">
            Welcome to Relay
          </h1>
          <p className="text-[14px] text-body leading-relaxed">
            AI chat that can work with your local files and codebase.
            <br />
            Start chatting right away, or connect an agent for the full experience.
          </p>
        </div>

        <div className="mb-8">
          <div className="flex flex-wrap gap-2 justify-center">
            {chatSuggestions.map(s => (
              <button
                type="button"
                key={s.text}
                onClick={() => {
                  localStorage.setItem("relay-has-chatted", "true");
                  onSuggestion(s.text);
                }}
                className="text-[12px] px-3 py-1.5 rounded-[4px] border border-border text-body hover:text-foreground hover:border-muted transition-colors font-mono"
              >
                <span className="mr-1.5">{s.icon}</span>{s.text}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-border-subtle rounded-[8px] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSetup(prev => !prev)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-hover transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-[6px] h-[6px] rounded-full bg-dim" />
              <span className="text-[13px] font-medium text-body">Connect your local agent</span>
            </div>
            <span className="text-[11px] text-dim font-mono">{showSetup ? "hide" : "3 steps"}</span>
          </button>
          <div className={`expandable ${showSetup ? "expanded" : ""}`}>
            <div>
              <div className="px-4 pb-4 border-t border-border-subtle pt-3">
                <p className="text-[12px] text-muted mb-3">
                  The agent runs on your machine and gives Relay access to your files, terminal, and codebase.
                </p>
                <AgentSetupGuide inline />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12 sm:py-16 animate-fade-in max-w-[520px] mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-[36px] font-bold text-foreground tracking-[-0.03em] mb-2">
          Relay
        </h1>
        {hasAgent ? (
          <p className="text-[13px] text-body">
            Agent connected. I can read files, run commands, and work with your codebase.
          </p>
        ) : (
          <p className="text-[13px] text-muted">
            Ask me anything. <button type="button" onClick={() => setShowSetup(true)} className="text-accent hover:underline">Connect an agent</button> for file and shell access.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 justify-center mb-6">
        {suggestions.map(s => (
          <button
            type="button"
            key={s.text}
            onClick={() => {
              localStorage.setItem("relay-has-chatted", "true");
              onSuggestion(s.text);
            }}
            className="text-[12px] px-3 py-1.5 rounded-[4px] border border-border text-body hover:text-foreground hover:border-muted transition-colors font-mono"
          >
            <span className="mr-1.5">{s.icon}</span>{s.text}
          </button>
        ))}
      </div>

      {showSetup && !hasAgent && (
        <div className="border border-border-subtle rounded-[8px] p-4 animate-scale-in">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-body">Connect your agent</span>
            <button type="button" onClick={() => setShowSetup(false)} className="text-[10px] text-dim hover:text-muted">✕</button>
          </div>
          <p className="text-[12px] text-muted mb-3">
            The agent runs on your machine and gives Relay access to your files, terminal, and codebase.
          </p>
          <AgentSetupGuide inline />
        </div>
      )}
    </div>
  );
}
