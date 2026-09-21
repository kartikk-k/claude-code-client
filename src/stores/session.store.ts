"use client";

/**
 * Session store — the server-backed data + live send/stream state:
 *  - `projects` / `sessionsByProject`: cached reads from the local data server.
 *  - `active`: which chat is open (persisted, so the app reopens it on launch).
 *  - `transcripts`: loaded transcript per session.
 *  - `streaming`: the in-flight assistant text per session (live token stream)
 *    plus an optimistic user turn, so the UI updates the moment you send.
 *
 * Server data itself is NOT persisted (the data server is the source of truth
 * and is re-read on mount) — only `active` survives reloads. All mutating
 * actions (rename / pin / archive / delete) call the server and optimistically
 * update the cache.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, streamMessage, type SendPayload } from "../app/lib/api";
import type {
  ProjectSummary,
  SessionSummary,
  SessionTranscript,
} from "../app/lib/types";

/** Live stream state for a session while a turn is generating. */
export type StreamState = {
  /** Accumulated assistant text from stream deltas. */
  text: string;
  /** Optimistic user prompt shown immediately after send. */
  pendingUserText: string;
  active: boolean;
  error?: string;
};

type SessionState = {
  projects: ProjectSummary[];
  sessionsByProject: Record<string, SessionSummary[]>;
  transcripts: Record<string, SessionTranscript>;
  streaming: Record<string, StreamState>;
  active: { projectId: string; sessionId: string } | null;
  serverError: string | null;
  /** AbortControllers for in-flight sends, keyed by session (not persisted). */
  _aborts: Record<string, AbortController>;

  // --- reads ---
  loadProjects: () => Promise<void>;
  loadSessions: (projectId: string) => Promise<void>;
  selectSession: (projectId: string, sessionId: string) => Promise<void>;
  refreshTranscript: (projectId: string, sessionId: string) => Promise<void>;
  /** Clear the active chat (composer targets a brand-new session on next send). */
  newChat: (projectId?: string) => void;

  // --- send / stream ---
  sendMessage: (input: {
    projectId: string;
    sessionId?: string;
    cwd: string;
    text: string;
    images?: string[];
    model?: string;
    permissionMode?: string;
  }) => Promise<void>;
  abortSend: (sessionId: string) => void;

  // --- mutations (server-backed) ---
  renameSession: (
    projectId: string,
    sessionId: string,
    title: string,
  ) => Promise<void>;
  setPinned: (
    projectId: string,
    sessionId: string,
    pinned: boolean,
  ) => Promise<void>;
  setArchived: (
    projectId: string,
    sessionId: string,
    archived: boolean,
  ) => Promise<void>;
  deleteSession: (projectId: string, sessionId: string) => Promise<void>;
};

/** Patch one session inside sessionsByProject immutably. */
function patchSession(
  byProject: Record<string, SessionSummary[]>,
  projectId: string,
  sessionId: string,
  patch: Partial<SessionSummary>,
): Record<string, SessionSummary[]> {
  const list = byProject[projectId];
  if (!list) return byProject;
  return {
    ...byProject,
    [projectId]: list.map((s) =>
      s.id === sessionId ? { ...s, ...patch } : s,
    ),
  };
}

/** Extract streamed text out of a Claude stream-json `message` frame. */
function extractDelta(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  // content_block_delta → { delta: { type: "text_delta", text } }
  if (d.type === "content_block_delta") {
    const delta = d.delta as Record<string, unknown> | undefined;
    if (delta && delta.type === "text_delta" && typeof delta.text === "string") {
      return delta.text;
    }
  }
  return "";
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      projects: [],
      sessionsByProject: {},
      transcripts: {},
      streaming: {},
      active: null,
      serverError: null,
      _aborts: {},

      loadProjects: async () => {
        try {
          const projects = await api.projects();
          set({ projects, serverError: null });
          // Prefetch each project's sessions so Pinned/Recents populate.
          for (const p of projects) {
            api
              .sessions(p.id)
              .then((s) =>
                set((st) =>
                  st.sessionsByProject[p.id]
                    ? {}
                    : { sessionsByProject: { ...st.sessionsByProject, [p.id]: s } },
                ),
              )
              .catch((e) => set({ serverError: String(e) }));
          }
        } catch (e) {
          set({ serverError: String(e) });
        }
      },

      loadSessions: async (projectId) => {
        if (get().sessionsByProject[projectId]) return;
        try {
          const s = await api.sessions(projectId);
          set((st) => ({
            sessionsByProject: { ...st.sessionsByProject, [projectId]: s },
          }));
        } catch (e) {
          set({ serverError: String(e) });
        }
      },

      selectSession: async (projectId, sessionId) => {
        set({ active: { projectId, sessionId } });
        try {
          const t = await api.session(projectId, sessionId);
          set((st) => ({ transcripts: { ...st.transcripts, [sessionId]: t } }));
        } catch (e) {
          set({ serverError: String(e) });
        }
      },

      refreshTranscript: async (projectId, sessionId) => {
        try {
          const t = await api.session(projectId, sessionId);
          set((st) => ({ transcripts: { ...st.transcripts, [sessionId]: t } }));
        } catch (e) {
          set({ serverError: String(e) });
        }
      },

      newChat: (projectId) => {
        set((st) => ({
          active: projectId ? { projectId, sessionId: "" } : null,
        }));
      },

      sendMessage: async (input) => {
        const {
          projectId,
          cwd,
          text,
          images = [],
          model,
          permissionMode,
        } = input;
        // For a brand-new chat, mint a session id up front so the CLI owns it.
        const isNew = !input.sessionId;
        const sessionId = input.sessionId || crypto.randomUUID();

        const controller = new AbortController();
        set((st) => ({
          active: { projectId, sessionId },
          _aborts: { ...st._aborts, [sessionId]: controller },
          streaming: {
            ...st.streaming,
            [sessionId]: {
              text: "",
              pendingUserText: text,
              active: true,
            },
          },
        }));

        const payload: SendPayload = {
          cwd,
          prompt: text,
          images,
          model,
          permissionMode,
          ...(isNew ? { newSessionId: sessionId } : { sessionId }),
        };

        try {
          for await (const frame of streamMessage(payload, controller.signal)) {
            if (frame.event === "done") break;
            if (frame.event === "error") {
              set((st) => ({
                streaming: {
                  ...st.streaming,
                  [sessionId]: {
                    ...(st.streaming[sessionId] ?? {
                      text: "",
                      pendingUserText: text,
                      active: false,
                    }),
                    active: false,
                    error: String(
                      (frame.data as { message?: string })?.message ?? "error",
                    ),
                  },
                },
              }));
              break;
            }
            const chunk = extractDelta(frame.data);
            if (chunk) {
              set((st) => {
                const cur = st.streaming[sessionId];
                if (!cur) return {};
                return {
                  streaming: {
                    ...st.streaming,
                    [sessionId]: { ...cur, text: cur.text + chunk },
                  },
                };
              });
            }
          }
        } catch (e) {
          set({ serverError: String(e) });
        } finally {
          // Reconcile: the CLI has appended the durable turn to disk — re-read it.
          await get().refreshTranscript(projectId, sessionId);
          // A new session now exists on disk; refresh the project's list.
          if (isNew) {
            try {
              const s = await api.sessions(projectId);
              set((st) => ({
                sessionsByProject: { ...st.sessionsByProject, [projectId]: s },
              }));
            } catch {
              /* non-fatal */
            }
          }
          set((st) => {
            const { [sessionId]: _drop, ...restStreaming } = st.streaming;
            const { [sessionId]: _a, ...restAborts } = st._aborts;
            return { streaming: restStreaming, _aborts: restAborts };
          });
        }
      },

      abortSend: (sessionId) => {
        const c = get()._aborts[sessionId];
        c?.abort();
      },

      renameSession: async (projectId, sessionId, title) => {
        set((st) => ({
          sessionsByProject: patchSession(
            st.sessionsByProject,
            projectId,
            sessionId,
            { title, customTitle: title },
          ),
        }));
        try {
          await api.updateSession(projectId, sessionId, { title });
        } catch (e) {
          set({ serverError: String(e) });
        }
      },

      setPinned: async (projectId, sessionId, pinned) => {
        set((st) => ({
          sessionsByProject: patchSession(
            st.sessionsByProject,
            projectId,
            sessionId,
            { pinned },
          ),
        }));
        try {
          await api.updateSession(projectId, sessionId, { pinned });
        } catch (e) {
          set({ serverError: String(e) });
        }
      },

      setArchived: async (projectId, sessionId, archived) => {
        set((st) => ({
          sessionsByProject: patchSession(
            st.sessionsByProject,
            projectId,
            sessionId,
            { archived },
          ),
        }));
        try {
          await api.updateSession(projectId, sessionId, { archived });
        } catch (e) {
          set({ serverError: String(e) });
        }
      },

      deleteSession: async (projectId, sessionId) => {
        set((st) => {
          const list = st.sessionsByProject[projectId] ?? [];
          const active =
            st.active?.sessionId === sessionId ? null : st.active;
          return {
            sessionsByProject: {
              ...st.sessionsByProject,
              [projectId]: list.filter((s) => s.id !== sessionId),
            },
            active,
          };
        });
        try {
          await api.deleteSession(projectId, sessionId);
        } catch (e) {
          set({ serverError: String(e) });
        }
      },
    }),
    {
      name: "claude-client:session",
      version: 1,
      // Only the active-chat pointer is durable; server data re-reads on mount.
      partialize: (s) => ({ active: s.active }),
    },
  ),
);
