import { DbConnection, tables } from "./module_bindings";
import type { Agent, Message, MessagePart, Session, ToolCommand, ToolResult } from "./module_bindings/types";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export type { Agent, Message, MessagePart, Session, ToolCommand, ToolResult };

export type SpacetimeListener = {
  onConnectionChange?: (state: ConnectionState) => void;
  onMessageInsert?: (msg: Message) => void;
  onMessageUpdate?: (oldMsg: Message, newMsg: Message) => void;
  onPartInsert?: (part: MessagePart) => void;
  onSessionInsert?: (session: Session) => void;
  onSessionUpdate?: (oldSession: Session, newSession: Session) => void;
  onToolCommandInsert?: (cmd: ToolCommand) => void;
  onToolCommandUpdate?: (oldCmd: ToolCommand, newCmd: ToolCommand) => void;
  onToolResultInsert?: (result: ToolResult) => void;
  onAgentInsert?: (agent: Agent) => void;
  onAgentUpdate?: (oldAgent: Agent, newAgent: Agent) => void;
  onSubscriptionApplied?: () => void;
};

let connection: DbConnection | null = null;
let currentState: ConnectionState = "disconnected";
let subscriptionApplied = false;
const listeners = new Set<SpacetimeListener>();

export function getConnectionState(): ConnectionState {
  return currentState;
}

export function getConnection(): DbConnection | null {
  return connection;
}

export function addListener(listener: SpacetimeListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify<K extends keyof SpacetimeListener>(
  event: K,
  ...args: Parameters<NonNullable<SpacetimeListener[K]>>
) {
  for (const l of listeners) {
    const fn = l[event];
    if (fn) (fn as (...a: unknown[]) => void)(...args);
  }
}

export function connectToSpacetime(uri: string, dbName: string): DbConnection {
  if (connection) return connection;

  currentState = "connecting";
  notify("onConnectionChange", "connecting");

  const conn = DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(dbName)
    .onConnect((conn) => {
      currentState = "connected";
      notify("onConnectionChange", "connected");

      conn
        .subscriptionBuilder()
        .onApplied(() => {
          subscriptionApplied = true;
          notify("onSubscriptionApplied");
        })
        .subscribe([
          tables.message,
          tables.message_part,
          tables.session,
          tables.tool_command,
          tables.tool_result,
          tables.agent,
        ]);
    })
    .onDisconnect(() => {
      currentState = "disconnected";
      subscriptionApplied = false;
      notify("onConnectionChange", "disconnected");
      connection = null;
    })
    .onConnectError(() => {
      currentState = "error";
      notify("onConnectionChange", "error");
      connection = null;
    })
    .build();

  conn.db.message_part.onInsert((_ctx, part) => {
    notify("onPartInsert", part);
  });

  conn.db.message.onInsert((_ctx, msg) => {
    notify("onMessageInsert", msg);
  });

  conn.db.message.onUpdate((_ctx, oldMsg, newMsg) => {
    notify("onMessageUpdate", oldMsg, newMsg);
  });

  conn.db.session.onInsert((_ctx, session) => {
    notify("onSessionInsert", session);
  });

  conn.db.session.onUpdate((_ctx, oldSession, newSession) => {
    notify("onSessionUpdate", oldSession, newSession);
  });

  conn.db.tool_command.onInsert((_ctx, cmd) => {
    notify("onToolCommandInsert", cmd);
  });

  conn.db.tool_command.onUpdate((_ctx, oldCmd, newCmd) => {
    notify("onToolCommandUpdate", oldCmd, newCmd);
  });

  conn.db.tool_result.onInsert((_ctx, result) => {
    notify("onToolResultInsert", result);
  });

  conn.db.agent.onInsert((_ctx, agent) => {
    notify("onAgentInsert", agent);
  });

  conn.db.agent.onUpdate((_ctx, oldAgent, newAgent) => {
    notify("onAgentUpdate", oldAgent, newAgent);
  });

  connection = conn;
  return conn;
}

export function disconnect() {
  if (connection) {
    connection.disconnect();
    connection = null;
  }
}

export function getSessionsFromCache(): Session[] {
  if (!connection) return [];
  const sessions: Session[] = [];
  for (const s of connection.db.session.iter()) {
    sessions.push(s);
  }
  return sessions;
}

export function getSessionFromCache(sessionId: string): Session | undefined {
  if (!connection) return undefined;
  for (const s of connection.db.session.iter()) {
    if (s.id === sessionId) return s;
  }
  return undefined;
}

export function getMessagesForSession(sessionId: string): Message[] {
  if (!connection) return [];
  const messages: Message[] = [];
  for (const m of connection.db.message.iter()) {
    if (m.sessionId === sessionId) messages.push(m);
  }
  return messages;
}

export function getPartsForMessage(messageId: string): MessagePart[] {
  if (!connection) return [];
  const parts: MessagePart[] = [];
  for (const p of connection.db.message_part.iter()) {
    if (p.messageId === messageId) parts.push(p);
  }
  parts.sort((a, b) => a.partIndex - b.partIndex);
  return parts;
}

export function getToolCommandsForSession(sessionId: string): ToolCommand[] {
  if (!connection) return [];
  const cmds: ToolCommand[] = [];
  for (const c of connection.db.tool_command.iter()) {
    if (c.sessionId === sessionId) cmds.push(c);
  }
  return cmds;
}

export function getToolCommandsForMessage(messageId: string): ToolCommand[] {
  if (!connection) return [];
  const cmds: ToolCommand[] = [];
  for (const c of connection.db.tool_command.iter()) {
    if (c.messageId === messageId) cmds.push(c);
  }
  return cmds;
}

export function getToolResultForCommand(toolCommandId: number): ToolResult | undefined {
  if (!connection) return undefined;
  for (const r of connection.db.tool_result.iter()) {
    if (Number(r.toolCommandId) === toolCommandId) return r;
  }
  return undefined;
}

export function getAgentsFromCache(): Agent[] {
  if (!connection) return [];
  const agents: Agent[] = [];
  for (const a of connection.db.agent.iter()) {
    agents.push(a);
  }
  return agents;
}

export function isSpacetimeReady(): boolean {
  return currentState === "connected" && subscriptionApplied;
}

export function subscribeToSpacetimeState(callback: () => void): () => void {
  return addListener({
    onConnectionChange: () => callback(),
    onSubscriptionApplied: () => callback(),
  });
}
