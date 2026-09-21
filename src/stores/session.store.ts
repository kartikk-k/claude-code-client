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

/**
 * Encode a cwd into the project-dir id Claude Code uses under ~/.claude/projects
 * (it replaces "/" and "." with "-"). A brand-new chat's session file lands in
 * the dir for its cwd — which may differ from the project we launched it from —
 * so the reconcile fetch must target THIS id, not the launching project's.
 */
function encodeProjectId(cwd: string): string {
  return cwd.replace(/[/.]/g, "-");
}

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
  /** Working directory for a brand-new chat (no transcript yet) — so the
   *  composer can send before a session file exists. */
  newChatCwd?: string;
  serverError: string | null;
  /** AbortControllers for in-flight sends, keyed by session (not persisted). */
  _aborts: Record<string, AbortController>;

  // --- reads ---
  loadProjects: () => Promise<void>;
  loadSessions: (projectId: string) => Promise<void>;
  selectSession: (projectId: string, sessionId: string) => Promise<void>;
  /**
   * Select a session knowing only its id (the URL is `/[sessionId]`). Resolves
   * the owning project from loaded sessions — loading projects first if needed —
   * then selects. Returns the resolved projectId, or null if it can't be found.
   */
  selectSessionById: (sessionId: string) => Promise<string | null>;
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

/**
 * Extract streamed assistant text from a Claude CLI stream-json `message` frame.
 *
 * The CLI (`--include-partial-messages`) wraps Anthropic SSE events like:
 *   { type: "stream_event", event: { type: "content_block_delta",
 *       index, delta: { type: "text_delta", text } } }
 * We forward text_delta chunks for text blocks; thinking_delta is ignored here
 * (it renders separately). Also tolerate a flatter `content_block_delta` shape
 * in case a future CLI version drops the wrapper.
 */
function extractDelta(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  // Unwrap the CLI's `stream_event` envelope when present.
  const evt =
    d.type === "stream_event" && d.event && typeof d.event === "object"
      ? (d.event as Record<string, unknown>)
      : d;
  if (evt.type === "content_block_delta") {
    const delta = evt.delta as Record<string, unknown> | undefined;
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
        // Switch instantly: set active synchronously so the view swaps to the
        // (already-cached) transcript with no await in the critical path.
        set({ active: { projectId, sessionId } });
        // If we already have this transcript cached, don't refetch on the click
        // path — that added network latency to every switch AND replaced the
        // cached object with a new reference, forcing every transcript-keyed
        // memo (buildToc, prRef, resultsById) to recompute and the whole
        // message list to re-parse. `refreshTranscript` still exists for an
        // explicit reload / after a turn completes.
        if (get().transcripts[sessionId]) return;
        try {
          const t = await api.session(projectId, sessionId);
          set((st) => ({ transcripts: { ...st.transcripts, [sessionId]: t } }));
        } catch (e) {
          set({ serverError: String(e) });
        }
      },

      selectSessionById: async (sessionId) => {
        if (!sessionId) return null;
        // Already the active session? Nothing to resolve.
        const cur = get().active;
        if (cur?.sessionId === sessionId) return cur.projectId;

        // Find the owning project among loaded sessions.
        const findPid = () => {
          const byProject = get().sessionsByProject;
          for (const [pid, sessions] of Object.entries(byProject)) {
            if (sessions.some((s) => s.id === sessionId)) return pid;
          }
          return null;
        };

        let pid = findPid();
        if (!pid) {
          // Not resolvable yet. Kick off a projects load (which prefetches every
          // project's sessions) if we haven't already. The CALLER re-invokes
          // this as `sessionsByProject` fills in — so we don't poll here; we
          // just ensure the data is being fetched and return for now.
          if (get().projects.length === 0) await get().loadProjects();
          pid = findPid();
          if (!pid) return null; // caller's reactive effect will retry
        }

        // Set active optimistically even before the transcript arrives, so the
        // view leaves the empty state immediately on a cold reload.
        set({ active: { projectId: pid, sessionId } });
        await get().selectSession(pid, sessionId);
        return pid;
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
        set((st) => {
          if (!projectId) return { active: null, newChatCwd: undefined };
          // Derive the cwd from a sibling session whose cwd actually belongs to
          // THIS project (its encoding matches the project id), so a new chat
          // stays in the right directory. Fall back to the decoded project path.
          const sessions = st.sessionsByProject[projectId] ?? [];
          const ownCwd = sessions.find(
            (s) => s.cwd && encodeProjectId(s.cwd) === projectId,
          )?.cwd;
          const cwd =
            ownCwd ?? st.projects.find((p) => p.id === projectId)?.path;
          return {
            active: { projectId, sessionId: "" },
            newChatCwd: cwd,
          };
        });
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

        // Smooth typewriter reveal: the CLI emits text in a few big chunks, so
        // appending them raw looks jumpy. Instead we accumulate into `target`
        // and let a rAF ticker reveal `streaming.text` toward it a few chars per
        // frame, so it types in smoothly regardless of chunk size.
        let target = "";
        let revealed = 0;
        let raf = 0;
        const tick = () => {
          const cur = get().streaming[sessionId];
          if (!cur) {
            raf = 0;
            return;
          }
          if (revealed < target.length) {
            // Reveal proportionally to how far behind we are (min a few chars),
            // so a large backlog catches up fast but small ones stay gentle.
            const remaining = target.length - revealed;
            const step = Math.max(2, Math.ceil(remaining / 8));
            revealed = Math.min(target.length, revealed + step);
            set((st) => {
              const c = st.streaming[sessionId];
              if (!c) return {};
              return {
                streaming: {
                  ...st.streaming,
                  [sessionId]: { ...c, text: target.slice(0, revealed) },
                },
              };
            });
          }
          // Keep ticking while active or still catching up.
          if (get().streaming[sessionId]?.active || revealed < target.length) {
            raf = requestAnimationFrame(tick);
          } else {
            raf = 0;
          }
        };
        const startTicker = () => {
          if (!raf && typeof requestAnimationFrame !== "undefined") {
            raf = requestAnimationFrame(tick);
          }
        };

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
              target += chunk;
              startTicker();
            }
          }
          // Flush any remaining buffered characters instantly at end of turn.
          revealed = target.length;
        } catch (e) {
          set({ serverError: String(e) });
        } finally {
          if (raf) cancelAnimationFrame(raf);
          // The session file lands in the dir for its cwd, which for a NEW chat
          // may not be the project we launched from — reconcile against the
          // cwd-derived project id so the transcript/list target the real dir.
          const realProjectId = encodeProjectId(cwd);
          // Point `active` at the real project so the sidebar + transcript line up.
          if (realProjectId !== projectId) {
            set((st) =>
              st.active?.sessionId === sessionId
                ? { active: { projectId: realProjectId, sessionId } }
                : {},
            );
          }
          // Reconcile: the CLI has appended the durable turn to disk — re-read it.
          // The transcript is set BEFORE streaming is cleared (below), so the
          // durable turn is on screen the instant the live bubble is removed —
          // no flash, no duplicate.
          await get().refreshTranscript(realProjectId, sessionId);
          // A new session now exists on disk; refresh that project's list (and
          // the project list itself, in case a brand-new project dir appeared).
          if (isNew) {
            try {
              const s = await api.sessions(realProjectId);
              set((st) => ({
                sessionsByProject: {
                  ...st.sessionsByProject,
                  [realProjectId]: s,
                },
              }));
              get().loadProjects();
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
