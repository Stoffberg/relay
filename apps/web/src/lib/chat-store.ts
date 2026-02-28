import { extractTimestamp } from "../spacetime";
import type { Message, MessagePart, ToolCommand, ToolResult } from "../spacetime";

export interface ChatToolCall {
  id: number;
  toolName: string;
  toolArgs: string;
  status: string;
  output?: string;
  error?: string | null;
  success?: boolean;
}

export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "tool_calls"; calls: ChatToolCall[] };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  status: "queued" | "streaming" | "complete" | "error" | "optimistic";
  createdAt?: number;
  retryText?: string;
  toolCalls?: ChatToolCall[];
  segments?: MessageSegment[];
  sessionId?: string;
  promptTokens?: number;
  completionTokens?: number;
}

export type SessionStatus = "idle" | "streaming" | "waiting_for_tool" | "error";

export interface ChatStatus {
  busy: boolean;
  showThinking: boolean;
  sessionStatus: SessionStatus;
}

export function buildChatMessages(
  messages: readonly Message[],
  parts: readonly MessagePart[],
  commands: readonly ToolCommand[],
  results: readonly ToolResult[],
  sessionId: string,
  optimisticMessages: ChatMessage[],
): ChatMessage[] {
  const sessionMessages = [...messages.filter(m => m.sessionId === sessionId)];
  sessionMessages.sort((a, b) => extractTimestamp(a.createdAt) - extractTimestamp(b.createdAt));

  const partsByMessage = new Map<string, MessagePart[]>();
  for (const p of parts) {
    const list = partsByMessage.get(p.messageId);
    if (list) list.push(p);
    else partsByMessage.set(p.messageId, [p]);
  }

  const resultsByCommandId = new Map<number, ToolResult>();
  for (const r of results) {
    resultsByCommandId.set(Number(r.toolCommandId), r);
  }

  const toolCallsByMessage = new Map<string, ChatToolCall[]>();
  for (const cmd of commands) {
    if (cmd.sessionId !== sessionId) continue;
    const existing = toolCallsByMessage.get(cmd.messageId) || [];
    const result = resultsByCommandId.get(Number(cmd.id));
    existing.push({
      id: Number(cmd.id),
      toolName: cmd.toolName,
      toolArgs: cmd.toolArgs,
      status: cmd.status,
      output: result?.output,
      error: result?.error,
      success: result?.success,
    });
    toolCallsByMessage.set(cmd.messageId, existing);
  }

  const dbMessageIds = new Set(sessionMessages.map(m => m.id));

  const chatMessages: ChatMessage[] = sessionMessages.map(m => {
    const msgParts = partsByMessage.get(m.id) || [];
    msgParts.sort((a, b) => a.partIndex - b.partIndex);
    const content = msgParts.map(p => p.content).join("");
    const toolCalls = toolCallsByMessage.get(m.id);
    return {
      id: m.id,
      role: m.role as ChatMessage["role"],
      content,
      status: m.status as ChatMessage["status"],
      createdAt: extractTimestamp(m.createdAt),
      toolCalls,
      sessionId,
      promptTokens: m.promptTokens != null ? Number(m.promptTokens) : undefined,
      completionTokens: m.completionTokens != null ? Number(m.completionTokens) : undefined,
    };
  });

  for (const opt of optimisticMessages) {
    if (!dbMessageIds.has(opt.id)) {
      chatMessages.push(opt);
    }
  }

  return groupConsecutiveAssistantMessages(chatMessages);
}

function buildSegments(msg: ChatMessage): MessageSegment[] {
  const segs: MessageSegment[] = [];
  if (msg.content) segs.push({ type: "text", content: msg.content });
  if (msg.toolCalls && msg.toolCalls.length > 0) segs.push({ type: "tool_calls", calls: msg.toolCalls });
  return segs;
}

function groupConsecutiveAssistantMessages(messages: ChatMessage[]): ChatMessage[] {
  const grouped: ChatMessage[] = [];

  for (const msg of messages) {
    if (msg.role !== "assistant") {
      grouped.push(msg);
      continue;
    }

    const prev = grouped.at(-1);
    if (prev && prev.role === "assistant") {
      const newSegments = buildSegments(msg);
      prev.segments = [...(prev.segments || []), ...newSegments];

      const allContent = (prev.segments)
        .filter((s): s is MessageSegment & { type: "text" } => s.type === "text")
        .map(s => s.content)
        .join("\n\n");
      prev.content = allContent;

      const allCalls = (prev.segments)
        .filter((s): s is MessageSegment & { type: "tool_calls" } => s.type === "tool_calls")
        .flatMap(s => s.calls);
      prev.toolCalls = allCalls.length > 0 ? allCalls : undefined;

      prev.promptTokens = (prev.promptTokens ?? 0) + (msg.promptTokens ?? 0);
      prev.completionTokens = (prev.completionTokens ?? 0) + (msg.completionTokens ?? 0);

      prev.status = msg.status;
      prev.createdAt = msg.createdAt ?? prev.createdAt;
    } else {
      const initial = { ...msg };
      initial.segments = buildSegments(msg);
      grouped.push(initial);
    }
  }

  return grouped;
}

export function computeStatus(
  sessionStatus: SessionStatus,
  messages: ChatMessage[],
  hasOptimistic: boolean,
): ChatStatus {
  const busy = sessionStatus !== "idle" || hasOptimistic;
  const lastMsg = messages.at(-1);
  const showThinking = lastMsg
    ? lastMsg.status === "optimistic" || (lastMsg.role === "user" && busy)
    : false;
  return { busy, showThinking, sessionStatus };
}
