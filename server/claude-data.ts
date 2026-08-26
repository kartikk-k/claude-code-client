/**
 * Reads Claude Code's local data from ~/.claude and turns it into structured
 * objects the client can render. Pure filesystem reads — no mutation.
 *
 * Layout (macOS):
 *   ~/.claude/projects/<ENCODED_CWD>/<sessionId>.jsonl   main transcripts
 *   ~/.claude/projects/<ENCODED_CWD>/agent-<agentId>.jsonl sub-agent transcripts
 *   ~/.claude/history.jsonl                                global prompt history
 */
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

export const CLAUDE_DIR = join(homedir(), ".claude");
export const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

/** Decode an encoded project dir name back into a filesystem path.
 *  Claude replaces "/" (and "." ) with "-", which is lossy, so we can only
 *  best-effort reconstruct a display path. We keep the raw id for lookups. */
export function decodeProjectPath(encoded: string): string {
  // Leading "-" represents the root "/". Remaining "-" are path separators.
  // This is a display heuristic; the encoded id remains the source of truth.
  let s = encoded;
  if (s.startsWith("-")) s = "/" + s.slice(1);
  return s.replace(/-/g, "/");
}

export type ProjectSummary = {
  id: string; // encoded dir name
  path: string; // decoded display path
  name: string; // last path segment
  sessionCount: number;
  lastActivity: number; // epoch ms
};

export type SessionSummary = {
  id: string; // sessionId (file stem)
  projectId: string;
  title: string;
  gitBranch?: string;
  cwd?: string;
  messageCount: number;
  updatedAt: number;
  createdAt: number;
};

type ContentBlock =
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
  | Record<string, unknown>;

export type ChatMessage = {
  uuid: string;
  parentUuid: string | null;
  role: "user" | "assistant" | "system";
  timestamp: number;
  isSidechain: boolean;
  agentId?: string;
  content: ContentBlock[];
  // convenience: durations attached to assistant turns, etc.
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
  messages: ChatMessage[]; // main-line (non-sidechain) messages, ordered
  agents: SubAgent[]; // sub-agents grouped by agentId
};

/* ------------------------------------------------------------------ */
/* Low-level helpers                                                    */
/* ------------------------------------------------------------------ */

async function readJsonl(path: string): Promise<Record<string, unknown>[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const rows: Record<string, unknown>[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      rows.push(JSON.parse(t));
    } catch {
      /* skip malformed line */
    }
  }
  return rows;
}

function toMs(ts: unknown): number {
  if (typeof ts === "number") return ts;
  if (typeof ts === "string") {
    const n = Date.parse(ts);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function normalizeContent(message: unknown): ContentBlock[] {
  if (!message || typeof message !== "object") return [];
  const c = (message as Record<string, unknown>).content;
  if (typeof c === "string") return [{ type: "text", text: c }];
  if (Array.isArray(c)) return c as ContentBlock[];
  return [];
}

function rowToMessage(row: Record<string, unknown>): ChatMessage | null {
  const type = row.type;
  if (type !== "user" && type !== "assistant" && type !== "system") return null;
  const message = row.message as Record<string, unknown> | undefined;
  const role =
    (message?.role as ChatMessage["role"]) ??
    (type === "user" ? "user" : type === "assistant" ? "assistant" : "system");
  return {
    uuid: (row.uuid as string) ?? "",
    parentUuid: (row.parentUuid as string) ?? null,
    role,
    timestamp: toMs(row.timestamp),
    isSidechain: row.isSidechain === true,
    agentId: (row.agentId as string) ?? undefined,
    content: normalizeContent(message),
    model: (message?.model as string) ?? undefined,
    stopReason: (row.stopReason as string) ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** List all projects, newest activity first. */
export async function listProjects(): Promise<ProjectSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(PROJECTS_DIR);
  } catch {
    return [];
  }
  const projects: ProjectSummary[] = [];
  for (const id of entries) {
    const dir = join(PROJECTS_DIR, id);
    let st;
    try {
      st = await stat(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    let files: string[] = [];
    try {
      files = await readdir(dir);
    } catch {
      /* ignore */
    }
    // main sessions = *.jsonl that are NOT agent-*.jsonl
    const sessions = files.filter(
      (f) => f.endsWith(".jsonl") && !f.startsWith("agent-")
    );
    if (sessions.length === 0) continue;
    let last = st.mtimeMs;
    for (const f of sessions) {
      try {
        const fst = await stat(join(dir, f));
        if (fst.mtimeMs > last) last = fst.mtimeMs;
      } catch {
        /* ignore */
      }
    }
    const path = decodeProjectPath(id);
    projects.push({
      id,
      path,
      name: basename(path) || path,
      sessionCount: sessions.length,
      lastActivity: last,
    });
  }
  projects.sort((a, b) => b.lastActivity - a.lastActivity);
  return projects;
}

/** List sessions in a project, newest first. */
export async function listSessions(
  projectId: string
): Promise<SessionSummary[]> {
  const dir = join(PROJECTS_DIR, projectId);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const sessionFiles = files.filter(
    (f) => f.endsWith(".jsonl") && !f.startsWith("agent-")
  );
  const out: SessionSummary[] = [];
  for (const f of sessionFiles) {
    const full = join(dir, f);
    const rows = await readJsonl(full);
    if (rows.length === 0) continue;
    // title: last ai-title row wins; fall back to first user text
    let title = "";
    let cwd: string | undefined;
    let gitBranch: string | undefined;
    let msgCount = 0;
    let createdAt = 0;
    let updatedAt = 0;
    for (const r of rows) {
      if (r.type === "ai-title" && typeof r.aiTitle === "string")
        title = r.aiTitle;
      if (typeof r.cwd === "string") cwd = r.cwd;
      if (typeof r.gitBranch === "string") gitBranch = r.gitBranch;
      if (r.type === "user" || r.type === "assistant") msgCount++;
      const t = toMs(r.timestamp);
      if (t) {
        if (!createdAt) createdAt = t;
        updatedAt = t;
      }
    }
    if (!title) {
      const firstUser = rows.find((r) => r.type === "user");
      const blocks = firstUser ? normalizeContent(firstUser.message) : [];
      const text = blocks.find((b) => (b as { type?: string }).type === "text");
      title =
        (text as { text?: string })?.text?.slice(0, 60) || "Untitled session";
    }
    let st;
    try {
      st = await stat(full);
    } catch {
      /* ignore */
    }
    out.push({
      id: f.replace(/\.jsonl$/, ""),
      projectId,
      title,
      gitBranch,
      cwd,
      messageCount: msgCount,
      createdAt: createdAt || st?.birthtimeMs || 0,
      updatedAt: updatedAt || st?.mtimeMs || 0,
    });
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

/** Full transcript for a session, with sub-agents grouped out. */
export async function getSession(
  projectId: string,
  sessionId: string
): Promise<SessionTranscript | null> {
  const dir = join(PROJECTS_DIR, projectId);
  const mainRows = await readJsonl(join(dir, `${sessionId}.jsonl`));
  if (mainRows.length === 0) return null;

  let title = "";
  let cwd: string | undefined;
  let gitBranch: string | undefined;
  const mainMessages: ChatMessage[] = [];
  const sidechainByAgent = new Map<string, ChatMessage[]>();

  for (const r of mainRows) {
    if (r.type === "ai-title" && typeof r.aiTitle === "string")
      title = r.aiTitle;
    if (typeof r.cwd === "string") cwd = r.cwd;
    if (typeof r.gitBranch === "string") gitBranch = r.gitBranch;
    const m = rowToMessage(r);
    if (!m) continue;
    if (m.isSidechain && m.agentId) {
      const arr = sidechainByAgent.get(m.agentId) ?? [];
      arr.push(m);
      sidechainByAgent.set(m.agentId, arr);
    } else if (!m.isSidechain) {
      mainMessages.push(m);
    }
  }

  // Also fold in any agent-*.jsonl files in the project dir for this session.
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    /* ignore */
  }
  for (const f of files) {
    if (!f.startsWith("agent-") || !f.endsWith(".jsonl")) continue;
    const rows = await readJsonl(join(dir, f));
    for (const r of rows) {
      if (r.sessionId && r.sessionId !== sessionId) continue;
      const m = rowToMessage(r);
      if (!m) continue;
      const agentId = (r.agentId as string) ?? f.slice(6).replace(/\.jsonl$/, "");
      m.agentId = agentId;
      m.isSidechain = true;
      const arr = sidechainByAgent.get(agentId) ?? [];
      arr.push(m);
      sidechainByAgent.set(agentId, arr);
    }
  }

  const agents: SubAgent[] = [...sidechainByAgent.entries()].map(
    ([agentId, messages]) => {
      messages.sort((a, b) => a.timestamp - b.timestamp);
      return {
        agentId,
        sessionId,
        messages,
        startedAt: messages[0]?.timestamp ?? 0,
      };
    }
  );
  agents.sort((a, b) => a.startedAt - b.startedAt);

  if (!title) title = "Untitled session";

  return {
    id: sessionId,
    projectId,
    title,
    cwd,
    gitBranch,
    messages: mainMessages,
    agents,
  };
}
