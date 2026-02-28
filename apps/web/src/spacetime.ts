import { DbConnection, DbConnectionBuilder, tables, reducers } from "./module_bindings";
import type { Agent, Message, MessagePart, Session, ToolCommand, ToolResult, Verification } from "./module_bindings/types";

export { DbConnection, DbConnectionBuilder, tables, reducers };
export type { Agent, Message, MessagePart, Session, ToolCommand, ToolResult, Verification };

export function extractTimestamp(ts: unknown): number {
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "number") return ts;
  if (ts && typeof ts === "object" && "__timestamp_micros_since_unix_epoch__" in ts) {
    return Number((ts as { __timestamp_micros_since_unix_epoch__: bigint }).__timestamp_micros_since_unix_epoch__ / 1000n);
  }
  console.warn("extractTimestamp: unrecognized format", ts);
  return Date.now();
}
