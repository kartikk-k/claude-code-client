import type {
  ProjectSummary,
  SessionSummary,
  SessionTranscript,
} from "./types";

/** Base URL of the local Bun+Hono server. Overridable at build time. */
export const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4317";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function send<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** A single changed file from `git status`/`git diff`. */
export type GitFile = {
  path: string;
  added: number;
  removed: number;
  status: string;
};
export type GitStatus = {
  branch?: string;
  ahead?: number;
  behind?: number;
  staged: GitFile[];
  unstaged: GitFile[];
};

/** A directory entry from the file-tree endpoint. */
export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
};

const enc = encodeURIComponent;
const sessionPath = (projectId: string, sessionId: string) =>
  `/api/projects/${enc(projectId)}/sessions/${enc(sessionId)}`;

export const api = {
  projects: () => get<ProjectSummary[]>("/api/projects"),
  sessions: (projectId: string) =>
    get<SessionSummary[]>(`/api/projects/${enc(projectId)}/sessions`),
  session: (projectId: string, sessionId: string) =>
    get<SessionTranscript>(sessionPath(projectId, sessionId)),

  /** Update session metadata (title / pinned / archived). */
  updateSession: (
    projectId: string,
    sessionId: string,
    patch: { title?: string; pinned?: boolean; archived?: boolean }
  ) => send<SessionSummary>("PATCH", sessionPath(projectId, sessionId), patch),

  /** Soft-delete a session (moves its transcript to the trash dir). */
  deleteSession: (projectId: string, sessionId: string) =>
    send<void>("DELETE", sessionPath(projectId, sessionId)),

  /** Persisted app config (settings + plugins) from ~/.claude-client/config.json. */
  getConfig: <T = Record<string, unknown>>() => get<T>("/api/config"),
  putConfig: <T = Record<string, unknown>>(config: T) =>
    send<T>("PUT", "/api/config", config),

  /** Git status + diff for a working directory. */
  gitStatus: (cwd: string) =>
    get<GitStatus>(`/api/git/status?cwd=${enc(cwd)}`),
  gitDiff: (cwd: string, file: string) =>
    get<{ diff: string }>(`/api/git/diff?cwd=${enc(cwd)}&file=${enc(file)}`),

  /** Lazy directory listing under a working directory. */
  files: (cwd: string, path = "") =>
    get<FileEntry[]>(`/api/files?cwd=${enc(cwd)}&path=${enc(path)}`),
  fileContent: (cwd: string, path: string) =>
    get<{ content: string; truncated: boolean }>(
      `/api/files/content?cwd=${enc(cwd)}&path=${enc(path)}`
    ),
};

export type SendPayload = {
  cwd: string;
  sessionId?: string;
  newSessionId?: string;
  prompt: string;
  images?: string[];
  model?: string;
  permissionMode?: string;
};

/** Send a message and stream SSE events. Returns an async iterator of
 *  { event, data } frames. */
export async function* streamMessage(
  payload: SendPayload,
  signal?: AbortSignal
): AsyncGenerator<{ event: string; data: unknown }> {
  const res = await fetch(`${SERVER_URL}/api/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.body) throw new Error("no stream body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!data) continue;
      try {
        yield { event, data: JSON.parse(data) };
      } catch {
        yield { event, data };
      }
    }
  }
}
