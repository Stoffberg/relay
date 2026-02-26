import {
  addListener,
  getMessagesForSession,
  getPartsForMessage,
  getSessionFromCache,
  getToolCommandsForSession,
  getToolResultForCommand,
  type Message,
  type MessagePart,
  type Session,
  type ToolCommand,
  type ToolResult,
} from "../spacetime";

export interface ChatToolCall {
  id: number;
  toolName: string;
  toolArgs: string;
  status: string;
  output?: string;
  error?: string | null;
  success?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  status: "streaming" | "complete" | "error" | "optimistic";
  toolCalls?: ChatToolCall[];
}

export type SessionStatus = "idle" | "streaming" | "waiting_for_tool" | "error";

export interface ChatStatus {
  busy: boolean;
  showThinking: boolean;
  sessionStatus: SessionStatus;
}

function buildChatMessagesFromCache(sessionId: string): ChatMessage[] {
  const messages = getMessagesForSession(sessionId);
  messages.sort((a, b) => {
    const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : Number(a.createdAt);
    const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : Number(b.createdAt);
    return aTime - bTime;
  });

  return messages.map((m) => {
    const parts = getPartsForMessage(m.id);
    const content = parts.map((p) => p.content).join("");
    return {
      id: m.id,
      role: m.role as ChatMessage["role"],
      content,
      status: m.status as "streaming" | "complete" | "error",
    };
  });
}

function getSessionStatus(sessionId: string): SessionStatus {
  const session = getSessionFromCache(sessionId);
  return (session?.status as SessionStatus) || "idle";
}

function buildToolCallMap(sessionId: string): Map<string, ChatToolCall[]> {
  const cmds = getToolCommandsForSession(sessionId);
  const map = new Map<string, ChatToolCall[]>();
  for (const cmd of cmds) {
    const existing = map.get(cmd.messageId) || [];
    const result = getToolResultForCommand(Number(cmd.id));
    existing.push({
      id: Number(cmd.id),
      toolName: cmd.toolName,
      toolArgs: cmd.toolArgs,
      status: cmd.status,
      output: result?.output,
      error: result?.error,
      success: result?.success,
    });
    map.set(cmd.messageId, existing);
  }
  return map;
}

export class ChatSessionStore {
  sessionId: string;
  private messageMap = new Map<string, ChatMessage>();
  private messageIds: string[] = [];
  private cachedMessageIds: Set<string>;
  private removeListener: (() => void) | null = null;
  private scrollCallback: (force?: boolean) => void;

  private listSubscribers = new Set<() => void>();
  private messageSubscribers = new Map<string, Set<() => void>>();
  private statusSubscribers = new Set<() => void>();

  private msgSubscribeFnCache = new Map<string, (cb: () => void) => () => void>();
  private msgSnapshotFnCache = new Map<string, () => ChatMessage | undefined>();

  private toolCallMap = new Map<string, ChatToolCall[]>();

  private flushScheduled = false;
  private needsScroll = false;
  private dirtyMessages = new Set<string>();
  private listDirty = false;
  private statusSnapshot: ChatStatus = { busy: false, showThinking: false, sessionStatus: "idle" };
  private awaitingResponse = false;

  constructor(sessionId: string, scrollCallback: (force?: boolean) => void) {
    this.sessionId = sessionId;
    this.scrollCallback = scrollCallback;

    const cached = buildChatMessagesFromCache(sessionId);
    this.loadMessages(cached);
    this.cachedMessageIds = new Set(cached.map((m) => m.id));
    this.toolCallMap = buildToolCallMap(sessionId);
    this.applyToolCallsToMessages();
    this.recomputeStatus();

    this.removeListener = addListener({
      onSubscriptionApplied: () => {
        const freshCached = buildChatMessagesFromCache(this.sessionId);
        this.cachedMessageIds = new Set(freshCached.map((m) => m.id));
        this.mergeMessages(freshCached);
        this.toolCallMap = buildToolCallMap(this.sessionId);
        this.applyToolCallsToMessages();
        this.listDirty = true;
        for (const id of this.messageMap.keys()) this.dirtyMessages.add(id);
        this.scheduleFlush();
      },
      onSessionUpdate: (_old: Session, newSession: Session) => {
        if (newSession.id !== this.sessionId) return;
        this.scheduleFlush();
      },
      onMessageInsert: (msg: Message) => {
        if (msg.sessionId !== this.sessionId) return;
        if (msg.role === "user") {
          this.cachedMessageIds.add(msg.id);
        }
        if (msg.role === "assistant") {
          this.awaitingResponse = false;
        }
        const existing = this.messageMap.get(msg.id);
        if (existing) {
          if (existing.status === "optimistic") {
            const updated = { ...existing, status: msg.status as ChatMessage["status"] };
            this.messageMap.set(msg.id, updated);
            this.dirtyMessages.add(msg.id);
          }
        } else {
          const newMsg: ChatMessage = {
            id: msg.id,
            role: msg.role as ChatMessage["role"],
            content: "",
            status: msg.status as ChatMessage["status"],
          };
          this.messageMap.set(msg.id, newMsg);
          this.messageIds = [...this.messageIds, msg.id];
          this.listDirty = true;
          this.dirtyMessages.add(msg.id);
        }
        this.needsScroll = true;
        this.scheduleFlush();
      },
      onMessageUpdate: (_oldMsg: Message, newMsg: Message) => {
        if (newMsg.sessionId !== this.sessionId) return;
        const existing = this.messageMap.get(newMsg.id);
        if (!existing) return;
        this.messageMap.set(newMsg.id, { ...existing, status: newMsg.status as ChatMessage["status"] });
        this.dirtyMessages.add(newMsg.id);
        this.scheduleFlush();
      },
      onPartInsert: (part: MessagePart) => {
        if (this.cachedMessageIds.has(part.messageId)) return;
        const existing = this.messageMap.get(part.messageId);
        if (!existing || existing.role === "user") return;
        this.messageMap.set(part.messageId, { ...existing, content: existing.content + part.content });
        this.dirtyMessages.add(part.messageId);
        this.needsScroll = true;
        this.scheduleFlush();
      },
      onToolCommandInsert: (cmd: ToolCommand) => {
        if (cmd.sessionId !== this.sessionId) return;
        this.upsertToolCall(cmd);
        this.scheduleFlush();
      },
      onToolCommandUpdate: (_old: ToolCommand, cmd: ToolCommand) => {
        if (cmd.sessionId !== this.sessionId) return;
        this.upsertToolCall(cmd);
        this.scheduleFlush();
      },
      onToolResultInsert: (result: ToolResult) => {
        this.applyToolResult(result);
        this.scheduleFlush();
      },
    });
  }

  private upsertToolCall(cmd: ToolCommand) {
    const calls = this.toolCallMap.get(cmd.messageId) || [];
    const idx = calls.findIndex((c) => c.id === Number(cmd.id));
    const result = (cmd.status === "completed" || cmd.status === "error")
      ? getToolResultForCommand(Number(cmd.id))
      : undefined;
    const tc: ChatToolCall = {
      id: Number(cmd.id),
      toolName: cmd.toolName,
      toolArgs: cmd.toolArgs,
      status: cmd.status,
      output: result?.output,
      error: result?.error,
      success: result?.success,
    };
    if (idx >= 0) {
      calls[idx] = tc;
    } else {
      calls.push(tc);
    }
    this.toolCallMap.set(cmd.messageId, calls);

    const msg = this.messageMap.get(cmd.messageId);
    if (msg) {
      this.messageMap.set(cmd.messageId, { ...msg, toolCalls: [...calls] });
      this.dirtyMessages.add(cmd.messageId);
    }
  }

  private applyToolResult(result: ToolResult) {
    const cmdId = Number(result.toolCommandId);
    for (const [messageId, calls] of this.toolCallMap) {
      const idx = calls.findIndex((c) => c.id === cmdId);
      if (idx >= 0) {
        calls[idx] = {
          ...calls[idx],
          output: result.output,
          error: result.error,
          success: result.success,
        };
        const msg = this.messageMap.get(messageId);
        if (msg) {
          this.messageMap.set(messageId, { ...msg, toolCalls: [...calls] });
          this.dirtyMessages.add(messageId);
        }
        break;
      }
    }
  }

  private applyToolCallsToMessages() {
    for (const [messageId, calls] of this.toolCallMap) {
      const msg = this.messageMap.get(messageId);
      if (msg) {
        this.messageMap.set(messageId, { ...msg, toolCalls: [...calls] });
      }
    }
  }

  private loadMessages(msgs: ChatMessage[]) {
    this.messageMap.clear();
    this.messageIds = msgs.map((m) => m.id);
    for (const m of msgs) {
      this.messageMap.set(m.id, m);
    }
  }

  private mergeMessages(freshMsgs: ChatMessage[]) {
    const freshIds = new Set(freshMsgs.map((m) => m.id));

    if (this.awaitingResponse && freshMsgs.some((m) => m.role === "assistant" && (m.status === "streaming" || m.status === "complete"))) {
      this.awaitingResponse = false;
    }

    for (const fm of freshMsgs) {
      const existing = this.messageMap.get(fm.id);
      if (!existing) {
        this.messageMap.set(fm.id, fm);
      } else if (existing.status === "optimistic" || existing.status === "streaming") {
        const merged = { ...existing };
        if (fm.content.length > existing.content.length) {
          merged.content = fm.content;
        }
        if (fm.status === "complete" || fm.status === "error") {
          merged.status = fm.status;
          merged.content = fm.content;
        }
        this.messageMap.set(fm.id, merged);
      } else {
        this.messageMap.set(fm.id, fm);
      }
    }

    const optimisticIds: string[] = [];
    for (const [id, msg] of this.messageMap) {
      if (!freshIds.has(id) && msg.status !== "optimistic") {
        this.messageMap.delete(id);
      }
      if (!freshIds.has(id) && msg.status === "optimistic") {
        optimisticIds.push(id);
      }
    }

    const orderedIds = freshMsgs.map((m) => m.id);
    for (const id of optimisticIds) {
      if (!orderedIds.includes(id)) orderedIds.push(id);
    }
    this.messageIds = orderedIds;
  }

  private recomputeStatus(): boolean {
    const sessionStatus = getSessionStatus(this.sessionId);
    const busy = sessionStatus !== "idle" || this.awaitingResponse;

    const lastId = this.messageIds.at(-1);
    const lastMsg = lastId ? this.messageMap.get(lastId) : undefined;
    const showThinking = lastMsg
      ? lastMsg.status === "optimistic" || (lastMsg.role === "user" && this.awaitingResponse)
      : false;

    if (
      busy !== this.statusSnapshot.busy ||
      showThinking !== this.statusSnapshot.showThinking ||
      sessionStatus !== this.statusSnapshot.sessionStatus
    ) {
      this.statusSnapshot = { busy, showThinking, sessionStatus };
      return true;
    }
    return false;
  }

  private scheduleFlush() {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    requestAnimationFrame(() => {
      this.flushScheduled = false;
      const scroll = this.needsScroll;
      this.needsScroll = false;

      for (const id of this.dirtyMessages) {
        const subs = this.messageSubscribers.get(id);
        if (subs) for (const sub of subs) sub();
      }
      this.dirtyMessages.clear();

      if (this.listDirty) {
        this.listDirty = false;
        for (const sub of this.listSubscribers) sub();
      }

      if (this.recomputeStatus()) {
        for (const sub of this.statusSubscribers) sub();
      }

      if (scroll) this.scrollCallback();
    });
  }

  private flushImmediate() {
    for (const id of this.dirtyMessages) {
      const subs = this.messageSubscribers.get(id);
      if (subs) for (const sub of subs) sub();
    }
    this.dirtyMessages.clear();

    if (this.listDirty) {
      this.listDirty = false;
      for (const sub of this.listSubscribers) sub();
    }

    if (this.recomputeStatus()) {
      for (const sub of this.statusSubscribers) sub();
    }
  }

  subscribeToList = (cb: () => void) => {
    this.listSubscribers.add(cb);
    return () => { this.listSubscribers.delete(cb); };
  };

  getListSnapshot = (): string[] => this.messageIds;

  subscribeToMessage(id: string): (cb: () => void) => () => void {
    let fn = this.msgSubscribeFnCache.get(id);
    if (fn) return fn;
    fn = (cb: () => void) => {
      let subs = this.messageSubscribers.get(id);
      if (!subs) {
        subs = new Set();
        this.messageSubscribers.set(id, subs);
      }
      subs.add(cb);
      return () => { subs!.delete(cb); };
    };
    this.msgSubscribeFnCache.set(id, fn);
    return fn;
  }

  getMessageSnapshot(id: string): () => ChatMessage | undefined {
    let fn = this.msgSnapshotFnCache.get(id);
    if (fn) return fn;
    fn = () => this.messageMap.get(id);
    this.msgSnapshotFnCache.set(id, fn);
    return fn;
  }

  subscribeToStatus = (cb: () => void) => {
    this.statusSubscribers.add(cb);
    return () => { this.statusSubscribers.delete(cb); };
  };

  getStatusSnapshot = (): ChatStatus => this.statusSnapshot;

  addOptimisticMessage(msg: ChatMessage) {
    this.awaitingResponse = true;
    this.messageMap.set(msg.id, msg);
    this.messageIds = [...this.messageIds, msg.id];
    this.listDirty = true;
    this.dirtyMessages.add(msg.id);
    this.flushImmediate();
  }

  resolveOptimistic(messageId: string) {
    const existing = this.messageMap.get(messageId);
    if (!existing || existing.status !== "optimistic") return;
    this.messageMap.set(messageId, { ...existing, status: "complete" });
    this.dirtyMessages.add(messageId);
    this.flushImmediate();
  }

  addErrorMessage(msg: ChatMessage) {
    this.awaitingResponse = false;
    this.messageMap.set(msg.id, msg);
    this.messageIds = [...this.messageIds, msg.id];
    this.listDirty = true;
    this.dirtyMessages.add(msg.id);
    this.flushImmediate();
  }

  destroy() {
    this.removeListener?.();
  }
}
