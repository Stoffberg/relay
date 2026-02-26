export interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export type Status = "idle" | "thinking" | "waiting" | "error";

export interface Project {
  name: string;
  color: string;
}

export interface Convo {
  id: string;
  title: string;
  project: Project;
  status: Status;
  lastMessage: string;
  time: string;
  messages: Msg[];
  pinned?: boolean;
  archived?: boolean;
  order?: number;
  hasQuestion?: boolean;
  questionText?: string;
  questionOptions?: string[];
}

export const PROJECTS: Project[] = [
  { name: "relay", color: "#3B82F6" },
  { name: "payments", color: "#F59E0B" },
  { name: "sarah/dash", color: "#8B5CF6" },
];

export const SEED_CONVOS: Convo[] = [
  {
    id: "c1",
    title: "Rate limiter middleware",
    project: PROJECTS[0],
    status: "waiting",
    lastMessage: "What about distributed rate limiting across multiple instances?",
    time: "now",
    hasQuestion: true,
    questionText: "Should I use a sliding window or fixed window for the rate limiter? Sliding is more accurate but costs ~2x the Redis ops.",
    questionOptions: ["Sliding window", "Fixed window", "Let me think about it"],
    messages: [
      { id: "1", role: "user", content: "Add rate limiting to the API gateway. What approach?" },
      {
        id: "2",
        role: "assistant",
        content:
          "Redis + INCR with TTL per user per minute window. Token bucket via Lua script for burst-friendly behavior.\n\nThe script stores token count + last refill timestamp. Redis executes Lua single-threaded so there's no race condition between check and decrement.\n\nFor your scale this handles everything cleanly.",
      },
      { id: "3", role: "user", content: "What about distributed rate limiting across multiple instances?" },
    ],
  },
  {
    id: "c2",
    title: "Auth token refresh bug",
    project: PROJECTS[0],
    status: "thinking",
    lastMessage: "Checking the interceptor chain now...",
    time: "2m",
    messages: [
      { id: "4", role: "user", content: "Users getting logged out randomly. Token refresh seems broken." },
      {
        id: "5",
        role: "assistant",
        content:
          "Checking the interceptor chain. The access token likely expires mid-request and the retry logic isn't acquiring a fresh token before retrying. I'm looking at the axios interceptor setup now...",
      },
    ],
  },
  {
    id: "c3",
    title: "Schema migration plan",
    project: PROJECTS[1],
    status: "idle",
    lastMessage: "Add new FK alongside the old one pointing to the same target.",
    time: "15m",
    messages: [
      { id: "6", role: "user", content: "Rename users.email_address to users.email without downtime." },
      {
        id: "7",
        role: "assistant",
        content:
          "Don't rename. Postgres takes an ACCESS EXCLUSIVE lock for renames.\n\nInstead: add new column, backfill, switch app, drop old. Three deploys, zero downtime. Expand-migrate-contract.",
      },
      { id: "8", role: "user", content: "What about the foreign keys pointing to that table?" },
      {
        id: "9",
        role: "assistant",
        content: "Add new FK alongside the old one pointing to the same target. Update app to write both. Once backfill done, drop old FK and old column together.",
      },
    ],
  },
  {
    id: "c4",
    title: "Notification service design",
    project: PROJECTS[1],
    status: "error",
    lastMessage: "Connection lost to project server",
    time: "1h",
    messages: [
      { id: "10", role: "user", content: "Design a notification service that handles 50k events/sec." },
      {
        id: "11",
        role: "assistant",
        content: "Separate ingestion from delivery. Kafka between them. Route based on user preferences cached in Redis.",
      },
    ],
  },
  {
    id: "c5",
    title: "Component library setup",
    project: PROJECTS[2],
    status: "idle",
    lastMessage: "Primitives first: Button, Input, Select, Modal.",
    time: "3h",
    messages: [
      { id: "12", role: "user", content: "Help me plan a component library for the new dashboard." },
      {
        id: "13",
        role: "assistant",
        content:
          "Primitives first: Button, Input, Select, Modal. Radix underneath, your design tokens on top. Then compose upward into domain components.",
      },
    ],
  },
  {
    id: "c6",
    title: "CI pipeline optimization",
    project: PROJECTS[2],
    status: "thinking",
    lastMessage: "Analyzing your workflow file...",
    time: "5m",
    messages: [
      { id: "14", role: "user", content: "Our CI takes 18 minutes. Can we get it under 5?" },
      {
        id: "15",
        role: "assistant",
        content:
          "Three immediate wins: parallelize test suites, cache node_modules by lockfile hash, skip lint on non-code changes. That alone should halve it. Let me look at the workflow file...",
      },
    ],
  },
];

export function statusDot(s: Status): { bg: string; cls: string } {
  if (s === "thinking") return { bg: "#A1A1AA", cls: "animate-pulse" };
  if (s === "waiting") return { bg: "#D4D4D8", cls: "" };
  if (s === "error") return { bg: "#EF4444", cls: "" };
  return { bg: "#27272A", cls: "" };
}
