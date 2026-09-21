/** Mirrors the shapes returned by the Bun server (server/claude-data.ts). */

export type ProjectSummary = {
  id: string;
  path: string;
  name: string;
  sessionCount: number;
  lastActivity: number;
};

export type SessionSummary = {
  id: string;
  projectId: string;
  title: string;
  gitBranch?: string;
  cwd?: string;
  messageCount: number;
  updatedAt: number;
  createdAt: number;
  /** Client-side metadata merged from the server's sidecar meta store. */
  pinned?: boolean;
  archived?: boolean;
  archivedAt?: number;
  /** User-set title override; when present, `title` mirrors it. */
  customTitle?: string;
};

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking?: string; text?: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: unknown;
      is_error?: boolean;
    }
  | { type: "image"; source?: unknown }
  | { type: string; [k: string]: unknown };

export type ChatMessage = {
  uuid: string;
  parentUuid: string | null;
  role: "user" | "assistant" | "system";
  timestamp: number;
  isSidechain: boolean;
  agentId?: string;
  content: ContentBlock[];
  model?: string;
  stopReason?: string;
};

export type SubAgent = {
  agentId: string;
  sessionId: string;
  parentToolUseId?: string;
  messages: ChatMessage[];
  startedAt: number;
};

export type SessionTranscript = {
  id: string;
  projectId: string;
  title: string;
  cwd?: string;
  gitBranch?: string;
  messages: ChatMessage[];
  agents: SubAgent[];
};
