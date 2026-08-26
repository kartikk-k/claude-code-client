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

export const api = {
  projects: () => get<ProjectSummary[]>("/api/projects"),
  sessions: (projectId: string) =>
    get<SessionSummary[]>(`/api/projects/${encodeURIComponent(projectId)}/sessions`),
  session: (projectId: string, sessionId: string) =>
    get<SessionTranscript>(
      `/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(
        sessionId
      )}`
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
