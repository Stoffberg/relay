export interface Session {
  id: string;
  owner_identity: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  created_at: number;
}

export type MessagePartType = "text" | "tool_call" | "tool_result" | "reasoning";

export interface MessagePart {
  id: string;
  message_id: string;
  part_type: MessagePartType;
  content: string;
  status: "pending" | "completed" | "error";
  order_index: number;
  updated_at: number;
}

export interface ToolCommand {
  id: string;
  session_id: string;
  message_id: string;
  agent_id: string;
  command_type: "file_read" | "file_write" | "file_edit" | "shell_exec" | "glob" | "grep";
  payload_json: string;
  status: "pending" | "running" | "completed" | "error";
  created_at: number;
}

export interface ToolResult {
  id: string;
  command_id: string;
  output: string;
  error: string | null;
  created_at: number;
}

export interface Agent {
  id: string;
  owner_identity: string;
  name: string;
  status: "online" | "offline";
  last_heartbeat: number;
}
