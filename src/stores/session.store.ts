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

/** Short unique id for queued messages. */
function cryptoId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

/**
 * Sessions currently being steered — while a session id is in here, the turn's
 * `finally` block must NOT auto-drain the queue (the steer flow is starting the
 * next turn itself). Module-level (not React/persisted state) so it's readable
 * synchronously inside the send loop.
 */
const _steering = new Set<string>();

/**
 * The in-flight `sendMessage` promise per session, so `steerMessage` can await
 * the aborted turn's teardown (transcript reconcile) BEFORE starting the steer
 * turn — keeping transcript writes ordered instead of racing. Module-level,
 * matching `_steering`.
 */
const _sendPromises = new Map<string, Promise<void>>();

/** A tool call observed live in the stream (for the shimmering "running" line). */
export type RunningTool = {
  name: string;
  /** Best-effort one-line detail (command / path / pattern), may be empty
   *  early since tool input streams in after the block starts. */
  detail: string;
};

/** Live stream state for a session while a turn is generating. */
export type StreamState = {
  /** Accumulated assistant text from stream deltas. */
  text: string;
  /** Optimistic user prompt shown immediately after send. */
  pendingUserText: string;
  active: boolean;
  error?: string;
  /** The tool call currently executing (drives the live shimmer line), or null
   *  when the model is generating text rather than running a tool. */
  runningTool?: RunningTool | null;
};

/**
 * A message the user composed WHILE a turn was still generating. It waits in
 * the per-session queue and is auto-sent as the next turn once the current one
 * finishes (unless that turn errored — then draining pauses). "Steer" sends one
 * immediately by interrupting the running turn.
 */
export type QueuedMessage = {
  id: string;
  text: string;
  images: string[];
  model?: string;
  permissionMode?: string;
};

/**
 * Per-session activity, for the sidebar status glyph:
 *  - "running":     a turn is generating for this session right now (spinner).
 *  - "done-unseen": a turn finished but the user hasn't opened the chat since
 *                   (blue dot) — cleared when they select it.
 *  - "needs-input": the turn is waiting on the user (circular exclamation).
 * A session with no entry shows its normal git glyph (or nothing).
 */
export type SessionActivity = "running" | "done-unseen" | "needs-input";

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
  /** Messages queued while a turn is generating, keyed by session. Drained
   *  one-at-a-time as turns complete; steering sends one immediately. */
  queued: Record<string, QueuedMessage[]>;
  /** Sidebar status per session (running / done-unseen / needs-input). A
   *  missing entry means "no special status". Not persisted. */
  sessionActivity: Record<string, SessionActivity>;

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
    /** Internal: a drained/queued turn for a session the user may have navigated
     *  away from — must NOT steal `active`/navigation. Foreground sends omit it. */
    background?: boolean;
  }) => Promise<void>;
  abortSend: (sessionId: string) => void;

  /** Set (or clear, with null) a session's sidebar status glyph. */
  setSessionActivity: (
    sessionId: string,
    activity: SessionActivity | null,
  ) => void;

  // --- message queue (send-while-generating) ---
  /** Queue a message to auto-send after the current turn (returns its id). */
  enqueueMessage: (
    sessionId: string,
    msg: Omit<QueuedMessage, "id">,
  ) => string;
  /** Remove a queued message without sending it. */
  removeQueued: (sessionId: string, id: string) => void;
  /** Reorder a queued message to the front of the queue. */
  moveQueuedToFront: (sessionId: string, id: string) => void;
  /**
   * Steer: send a queued message NOW — interrupt (abort) the running turn, then
   * immediately start a new turn with this message. Mirrors the CLI's
   * interrupt-then-send behavior.
   */
  steerMessage: (
    projectId: string,
    sessionId: string,
    cwd: string,
    id: string,
  ) => Promise<void>;

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

/**
 * Whether a stream frame indicates the turn is now waiting on the USER — e.g.
 * plan mode produced a plan that needs approval, or a tool permission couldn't
 * be auto-answered in the current mode. Best-effort: the headless CLI usually
 * auto-decides permissions, so this mainly catches plan-approval results.
 */
function detectNeedsInput(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  // The CLI's end-of-turn `result` frame.
  if (d.type === "result") {
    const subtype = typeof d.subtype === "string" ? d.subtype : "";
    // Plan mode surfaces a plan for approval; a permission prompt that stopped
    // the turn shows up as a non-success subtype mentioning permission/approval.
    if (/plan|permission|approval|input|ask/i.test(subtype)) return true;
    // Some builds attach a permission-denials array when a tool needs approval.
    const denials = d.permission_denials;
    if (Array.isArray(denials) && denials.length > 0) return true;
  }
  return false;
}

/** One-line detail for a live tool (command / path / pattern / url). */
function toolDetail(name: string, input: unknown): string {
  const n = name.toLowerCase();
  const rec =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : undefined;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  if (rec) {
    if (n === "bash")
      return (str(rec.command) ?? "").replace(/\s+/g, " ").trim();
    if (n === "read" || n === "write" || n === "edit" || n === "multiedit")
      return str(rec.file_path) ?? str(rec.path) ?? "";
    if (n === "grep") return str(rec.pattern) ?? "";
    if (n === "glob" || n === "ls") return str(rec.path) ?? str(rec.pattern) ?? "";
    if (n === "websearch") return str(rec.query) ?? "";
    if (n === "webfetch") return str(rec.url) ?? "";
    if (n === "task") return str(rec.description) ?? str(rec.subagent_type) ?? "";
  }
  return "";
}

/**
 * Detect tool activity in a stream frame so the UI can show a shimmering
 * "Running <tool> …" line for the live step.
 *  - Returns `{name, detail}` when a tool_use STARTS (content_block_start or a
 *    full assistant message with a tool_use block).
 *  - Returns "clear" when the model resumes text or the turn produces a
 *    tool_result (the tool finished).
 *  - Returns null for frames that say nothing about tool state.
 */
function extractToolEvent(
  data: unknown,
): { name: string; detail: string } | "clear" | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const evt =
    d.type === "stream_event" && d.event && typeof d.event === "object"
      ? (d.event as Record<string, unknown>)
      : d;

  // Partial-message events: a tool_use content block starting.
  if (evt.type === "content_block_start") {
    const block = evt.content_block as Record<string, unknown> | undefined;
    if (block && block.type === "tool_use" && typeof block.name === "string") {
      return { name: block.name, detail: toolDetail(block.name, block.input) };
    }
  }
  // A text delta means the model is writing prose again → no tool running.
  if (evt.type === "content_block_delta") {
    const delta = evt.delta as Record<string, unknown> | undefined;
    if (delta && delta.type === "text_delta") return "clear";
  }

  // Full CLI messages (non-partial): assistant with tool_use, or a user message
  // carrying tool_result (which means the last tool finished).
  const msg = d.message as Record<string, unknown> | undefined;
  const role = (d.type as string) === "assistant" || (d.type as string) === "user"
    ? (d.type as string)
    : undefined;
  const content = Array.isArray(msg?.content) ? (msg!.content as unknown[]) : null;
  if (content) {
    // Last tool_use in an assistant message = the tool about to run.
    if (role === "assistant") {
      for (let i = content.length - 1; i >= 0; i--) {
        const b = content[i] as Record<string, unknown>;
        if (b?.type === "tool_use" && typeof b.name === "string") {
          return { name: b.name, detail: toolDetail(b.name, b.input) };
        }
      }
    }
    // A tool_result in a user message = the running tool completed.
    if (role === "user" && content.some((b) => (b as Record<string, unknown>)?.type === "tool_result")) {
      return "clear";
    }
  }
  return null;
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
      queued: {},
      sessionActivity: {},

      setSessionActivity: (sessionId, activity) => {
        set((st) => {
          if (activity === null) {
            if (!(sessionId in st.sessionActivity)) return {};
            const { [sessionId]: _drop, ...rest } = st.sessionActivity;
            return { sessionActivity: rest };
          }
          if (st.sessionActivity[sessionId] === activity) return {};
          return {
            sessionActivity: { ...st.sessionActivity, [sessionId]: activity },
          };
        });
      },

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
        // Opening a chat clears its "finished in the background" blue dot (the
        // user has now seen it). A still-running spinner stays; a needs-input
        // glyph stays until the user actually responds.
        if (get().sessionActivity[sessionId] === "done-unseen") {
          get().setSessionActivity(sessionId, null);
        }
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

        // Publish this turn's promise so steerMessage can await its teardown.
        let resolveSend: () => void = () => {};
        _sendPromises.set(
          sessionId,
          new Promise<void>((r) => {
            resolveSend = r;
          }),
        );

        const controller = new AbortController();
        set((st) => {
          // Mark this session "running" for the sidebar spinner (and clear any
          // stale done/needs-input flag it may have carried).
          const { [sessionId]: _old, ...restActivity } = st.sessionActivity;
          return {
            // A background turn (drained queue / steer of a chat the user has
            // navigated away from) must NOT steal `active` — keep the current
            // view. Foreground sends focus their session as before.
            ...(input.background ? {} : { active: { projectId, sessionId } }),
            _aborts: { ...st._aborts, [sessionId]: controller },
            sessionActivity: { ...restActivity, [sessionId]: "running" },
            streaming: {
              ...st.streaming,
              [sessionId]: {
                text: "",
                pendingUserText: text,
                active: true,
              },
            },
          };
        });

        // Smooth typewriter reveal: the CLI emits text in a few big chunks, so
        // appending them raw looks jumpy. Instead we accumulate into `target`
        // and let a rAF ticker reveal `streaming.text` toward it a few chars per
        // frame, so it types in smoothly regardless of chunk size.
        let target = "";
        let revealed = 0;
        let raf = 0;
        // Whether this turn ended abnormally (server error or client abort).
        // A failed turn PAUSES queue draining so a bad chain doesn't cascade.
        let turnFailed = false;
        // Whether the turn ended waiting on the user (plan approval / a question
        // in a permission-restricted mode) → sidebar shows a needs-input glyph.
        let needsInput = false;
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
              turnFailed = true;
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
            // Track the live tool call so the UI can shimmer a "Running …" line.
            const toolEvt = extractToolEvent(frame.data);
            if (toolEvt !== null) {
              const runningTool = toolEvt === "clear" ? null : toolEvt;
              set((st) => {
                const cur = st.streaming[sessionId];
                if (!cur) return {};
                return {
                  streaming: {
                    ...st.streaming,
                    [sessionId]: { ...cur, runningTool },
                  },
                };
              });
            }
            // Detect a turn that ends waiting on the user (plan approval, or a
            // permission prompt that couldn't be auto-answered).
            if (detectNeedsInput(frame.data)) needsInput = true;
          }
          // Flush any remaining buffered characters instantly at end of turn.
          revealed = target.length;
        } catch (e) {
          // An AbortError is an intentional interrupt (cancel or steer), not a
          // failure that should pause the queue; anything else is a real error.
          const aborted =
            e instanceof DOMException && e.name === "AbortError";
          if (!aborted) {
            turnFailed = true;
            set({ serverError: String(e) });
          }
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

          // Drain the queue: auto-send the next queued message as the next turn.
          // Skip when (a) this turn failed (pause on error, per the spec),
          // (b) a steer is in progress for this session (steerMessage starts the
          // next turn itself), or (c) nothing is queued.
          let drained = false;
          if (!turnFailed && !_steering.has(sessionId)) {
            const next = (get().queued[sessionId] ?? [])[0];
            if (next) {
              drained = true;
              set((st) => ({
                queued: {
                  ...st.queued,
                  [sessionId]: (st.queued[sessionId] ?? []).filter(
                    (m) => m.id !== next.id,
                  ),
                },
              }));
              // Fire-and-forget: the next turn runs its own send/stream/drain.
              // Use the reconciled project id so a new session stays consistent.
              // `background: true` when the user has navigated away, so draining
              // the queue doesn't yank them back to this chat.
              const stillOpen = get().active?.sessionId === sessionId;
              void get().sendMessage({
                projectId: realProjectId,
                sessionId,
                cwd,
                text: next.text,
                images: next.images,
                model: next.model,
                permissionMode: next.permissionMode,
                background: !stillOpen,
              });
            }
          }

          // Update the sidebar status glyph, unless another turn is taking over
          // (drain / steer), which will set its own "running".
          if (!drained && !_steering.has(sessionId)) {
            const isOpen = get().active?.sessionId === sessionId;
            const cur = get().sessionActivity[sessionId];
            if (needsInput) {
              // The turn is waiting on the user — keep/mark needs-input even if
              // the chat is open (the user still has to act).
              get().setSessionActivity(sessionId, "needs-input");
            } else if (isOpen) {
              // The user is looking at this chat → nothing to flag; mark seen.
              get().setSessionActivity(sessionId, null);
            } else if (cur === "running") {
              // Finished in the background, unseen → blue dot.
              get().setSessionActivity(sessionId, "done-unseen");
            }
          }

          // Signal that this turn's teardown is complete (steer awaits this).
          _sendPromises.delete(sessionId);
          resolveSend();
        }
      },

      abortSend: (sessionId) => {
        const c = get()._aborts[sessionId];
        c?.abort();
      },

      enqueueMessage: (sessionId, msg) => {
        const id = `q-${cryptoId()}`;
        set((st) => ({
          queued: {
            ...st.queued,
            [sessionId]: [...(st.queued[sessionId] ?? []), { id, ...msg }],
          },
        }));
        return id;
      },

      removeQueued: (sessionId, id) => {
        set((st) => {
          const list = (st.queued[sessionId] ?? []).filter((m) => m.id !== id);
          return { queued: { ...st.queued, [sessionId]: list } };
        });
      },

      moveQueuedToFront: (sessionId, id) => {
        set((st) => {
          const list = st.queued[sessionId] ?? [];
          const target = list.find((m) => m.id === id);
          if (!target) return {};
          const rest = list.filter((m) => m.id !== id);
          return { queued: { ...st.queued, [sessionId]: [target, ...rest] } };
        });
      },

      steerMessage: async (projectId, sessionId, cwd, id) => {
        const list = get().queued[sessionId] ?? [];
        const msg = list.find((m) => m.id === id);
        if (!msg) return;
        // Remove it from the queue up front so the drain logic won't also send
        // it when the (soon-to-be-aborted) turn's finally block runs.
        set((st) => ({
          queued: {
            ...st.queued,
            [sessionId]: (st.queued[sessionId] ?? []).filter((m) => m.id !== id),
          },
        }));
        // Interrupt the running turn (if any). The aborted turn's finally block
        // reconciles the partial transcript from disk; `_steering` tells it to
        // NOT auto-drain (we're about to send this steer message ourselves).
        const running = Boolean(get().streaming[sessionId]?.active);
        if (running) {
          _steering.add(sessionId);
          const pending = _sendPromises.get(sessionId);
          get().abortSend(sessionId);
          // Await the aborted turn's teardown (transcript reconcile) so the new
          // turn's writes stay ordered, instead of racing on a fixed delay.
          if (pending) await pending;
          _steering.delete(sessionId);
        }
        await get().sendMessage({
          projectId,
          sessionId,
          cwd,
          text: msg.text,
          images: msg.images,
          model: msg.model,
          permissionMode: msg.permissionMode,
        });
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
