import { describe, expect, it } from "vitest";
import type { Message, MessagePart, ToolCommand, ToolResult } from "../spacetime";
import { type ChatMessage, buildChatMessages, computeStatus } from "./chat-store";

const timestamp = { __timestamp_micros_since_unix_epoch__: 0n };

function makeMessage(
  id: string,
  sessionId: string,
  role: string,
  status: string,
  createdAt: number
): Message {
  return {
    id,
    sessionId,
    role,
    status,
    createdAt,
    userId: null,
    error: null,
    promptTokens: null,
    completionTokens: null,
  } as unknown as Message;
}

function makePart(messageId: string, partIndex: number, content: string): MessagePart {
  return { id: 0n, messageId, partIndex, content, createdAt: timestamp } as unknown as MessagePart;
}

function makeCommand(
  id: number,
  messageId: string,
  sessionId: string,
  toolName: string,
  toolArgs: string,
  status: string
): ToolCommand {
  return {
    id: BigInt(id),
    toolCallId: `tc-${id}`,
    messageId,
    sessionId,
    agentId: "agent-1",
    toolName,
    toolArgs,
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
  } as unknown as ToolCommand;
}

function makeResult(
  toolCommandId: number,
  success: boolean,
  output: string,
  error: string | null = null
): ToolResult {
  return {
    id: 0n,
    toolCommandId: BigInt(toolCommandId),
    success,
    output,
    error: error ?? undefined,
    createdAt: timestamp,
  } as unknown as ToolResult;
}

function requireToolCalls(message: ChatMessage): NonNullable<ChatMessage["toolCalls"]> {
  expect(message.toolCalls).toBeDefined();
  return message.toolCalls ?? [];
}

describe("buildChatMessages", () => {
  it("returns empty array for no messages", () => {
    const result = buildChatMessages([], [], [], [], "session-1", []);
    expect(result).toEqual([]);
  });

  it("filters messages by sessionId", () => {
    const messages = [
      makeMessage("m1", "session-1", "user", "complete", 1000),
      makeMessage("m2", "session-2", "user", "complete", 2000),
    ];
    const parts = [makePart("m1", 0, "hello"), makePart("m2", 0, "other")];
    const result = buildChatMessages(messages, parts, [], [], "session-1", []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("m1");
    expect(result[0].content).toBe("hello");
  });

  it("sorts messages by timestamp", () => {
    const messages = [
      makeMessage("m2", "s1", "assistant", "complete", 2000),
      makeMessage("m1", "s1", "user", "complete", 1000),
    ];
    const result = buildChatMessages(messages, [], [], [], "s1", []);
    expect(result[0].id).toBe("m1");
    expect(result[1].id).toBe("m2");
  });

  it("assembles content from multiple parts in order", () => {
    const messages = [makeMessage("m1", "s1", "assistant", "complete", 1000)];
    const parts = [
      makePart("m1", 2, " world"),
      makePart("m1", 0, "hello"),
      makePart("m1", 1, " beautiful"),
    ];
    const result = buildChatMessages(messages, parts, [], [], "s1", []);
    expect(result[0].content).toBe("hello beautiful world");
  });

  it("attaches tool calls with results to messages", () => {
    const messages = [makeMessage("m1", "s1", "assistant", "complete", 1000)];
    const commands = [makeCommand(1, "m1", "s1", "file_read", '{"path":"/tmp"}', "completed")];
    const results = [makeResult(1, true, "file contents")];
    const result = buildChatMessages(messages, [], commands, results, "s1", []);
    expect(result[0].toolCalls).toHaveLength(1);
    const toolCalls = requireToolCalls(result[0]);
    expect(toolCalls[0].toolName).toBe("file_read");
    expect(toolCalls[0].output).toBe("file contents");
    expect(toolCalls[0].success).toBe(true);
  });

  it("includes optimistic messages not yet in DB", () => {
    const messages = [makeMessage("m1", "s1", "user", "complete", 1000)];
    const optimistic: ChatMessage[] = [
      {
        id: "opt-1",
        role: "user",
        content: "new message",
        status: "optimistic",
      },
    ];
    const result = buildChatMessages(messages, [], [], [], "s1", optimistic);
    expect(result).toHaveLength(2);
    expect(result[1].id).toBe("opt-1");
    expect(result[1].status).toBe("optimistic");
  });

  it("deduplicates optimistic messages that already exist in DB", () => {
    const messages = [makeMessage("m1", "s1", "user", "complete", 1000)];
    const optimistic: ChatMessage[] = [
      { id: "m1", role: "user", content: "hello", status: "optimistic" },
    ];
    const result = buildChatMessages(messages, [], [], [], "s1", optimistic);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("complete");
  });

  it("returns empty content when no parts exist", () => {
    const messages = [makeMessage("m1", "s1", "user", "complete", 1000)];
    const result = buildChatMessages(messages, [], [], [], "s1", []);
    expect(result[0].content).toBe("");
  });

  it("groups consecutive assistant messages into one", () => {
    const messages = [
      makeMessage("u1", "s1", "user", "complete", 1000),
      makeMessage("a1", "s1", "assistant", "complete", 2000),
      makeMessage("a2", "s1", "assistant", "complete", 3000),
      makeMessage("a3", "s1", "assistant", "complete", 4000),
    ];
    const parts = [
      makePart("a1", 0, "first response"),
      makePart("a2", 0, "second response"),
      makePart("a3", 0, "third response"),
    ];
    const result = buildChatMessages(messages, parts, [], [], "s1", []);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[1].role).toBe("assistant");
    expect(result[1].content).toBe("first response\n\nsecond response\n\nthird response");
  });

  it("does not group assistant messages separated by user message", () => {
    const messages = [
      makeMessage("a1", "s1", "assistant", "complete", 1000),
      makeMessage("u1", "s1", "user", "complete", 2000),
      makeMessage("a2", "s1", "assistant", "complete", 3000),
    ];
    const parts = [makePart("a1", 0, "first"), makePart("a2", 0, "second")];
    const result = buildChatMessages(messages, parts, [], [], "s1", []);
    expect(result).toHaveLength(3);
    expect(result[0].content).toBe("first");
    expect(result[2].content).toBe("second");
  });

  it("merges tool calls from grouped assistant messages", () => {
    const messages = [
      makeMessage("u1", "s1", "user", "complete", 1000),
      makeMessage("a1", "s1", "assistant", "complete", 2000),
      makeMessage("a2", "s1", "assistant", "complete", 3000),
    ];
    const commands = [
      makeCommand(1, "a1", "s1", "file_read", '{"path":"/a"}', "completed"),
      makeCommand(2, "a2", "s1", "glob", '{"pattern":"*.ts"}', "completed"),
    ];
    const results = [makeResult(1, true, "content of a"), makeResult(2, true, "found files")];
    const result = buildChatMessages(messages, [], commands, results, "s1", []);
    expect(result).toHaveLength(2);
    expect(result[1].toolCalls).toHaveLength(2);
    const toolCalls = requireToolCalls(result[1]);
    expect(toolCalls[0].toolName).toBe("file_read");
    expect(toolCalls[1].toolName).toBe("glob");
  });

  it("sums token counts across grouped assistant messages", () => {
    const m1 = {
      ...makeMessage("a1", "s1", "assistant", "complete", 1000),
      completionTokens: 100n,
      promptTokens: 500n,
    };
    const m2 = {
      ...makeMessage("a2", "s1", "assistant", "complete", 2000),
      completionTokens: 200n,
      promptTokens: 600n,
    };
    const result = buildChatMessages([m1, m2], [], [], [], "s1", []);
    expect(result).toHaveLength(1);
    expect(result[0].completionTokens).toBe(300);
    expect(result[0].promptTokens).toBe(1100);
  });

  it("grouped message inherits status of last sub-message", () => {
    const messages = [
      makeMessage("a1", "s1", "assistant", "complete", 1000),
      makeMessage("a2", "s1", "assistant", "streaming", 2000),
    ];
    const result = buildChatMessages(messages, [], [], [], "s1", []);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("streaming");
  });

  it("skips empty content when joining grouped messages", () => {
    const messages = [
      makeMessage("a1", "s1", "assistant", "complete", 1000),
      makeMessage("a2", "s1", "assistant", "complete", 2000),
    ];
    const parts = [makePart("a2", 0, "only second has content")];
    const result = buildChatMessages(messages, parts, [], [], "s1", []);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("only second has content");
  });
});

describe("computeStatus", () => {
  it("idle with no messages", () => {
    const result = computeStatus("idle", [], false);
    expect(result.busy).toBe(false);
    expect(result.showThinking).toBe(false);
    expect(result.sessionStatus).toBe("idle");
  });

  it("busy when streaming", () => {
    const result = computeStatus("streaming", [], false);
    expect(result.busy).toBe(true);
  });

  it("busy when waiting for tool", () => {
    const result = computeStatus("waiting_for_tool", [], false);
    expect(result.busy).toBe(true);
  });

  it("busy when has optimistic messages", () => {
    const result = computeStatus("idle", [], true);
    expect(result.busy).toBe(true);
  });

  it("showThinking when last message is optimistic", () => {
    const messages: ChatMessage[] = [
      { id: "m1", role: "user", content: "hello", status: "optimistic" },
    ];
    const result = computeStatus("idle", messages, true);
    expect(result.showThinking).toBe(true);
  });

  it("showThinking when last message is user and busy", () => {
    const messages: ChatMessage[] = [
      { id: "m1", role: "user", content: "hello", status: "complete" },
    ];
    const result = computeStatus("streaming", messages, false);
    expect(result.showThinking).toBe(true);
  });

  it("no showThinking when last message is assistant", () => {
    const messages: ChatMessage[] = [
      { id: "m1", role: "assistant", content: "hi", status: "complete" },
    ];
    const result = computeStatus("idle", messages, false);
    expect(result.showThinking).toBe(false);
  });

  it("no showThinking when empty messages", () => {
    const result = computeStatus("streaming", [], false);
    expect(result.showThinking).toBe(false);
  });

  it("error status propagates", () => {
    const result = computeStatus("error", [], false);
    expect(result.busy).toBe(true);
    expect(result.sessionStatus).toBe("error");
  });
});
