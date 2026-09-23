"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ChatMessage, ContentBlock } from "./lib/types";
import {
  useSessionStore,
  useUiStore,
  useActiveTranscript,
  useStreaming,
  useQueued,
  LEFT_MIN_WIDTH,
  LEFT_MAX_WIDTH,
} from "@/stores";
import { SessionSidebar } from "./components/SessionSidebar";
import { MessageList } from "./components/MessageList";
import { RightPanel } from "./components/RightPanel";
import { TocRail, type TocItem } from "./components/TocRail";
import { PrCard, extractPrUrl } from "./components/PrCard";
import { TooltipProvider } from "./components/ui/Tooltip";
import { RichComposer } from "./components/RichComposer";
import { QueuedMessages } from "./components/QueuedMessages";
import { BottomTerminalPanel } from "./components/BottomTerminalPanel";
import { ChatNav } from "./chat/components/ChatNav";
import { useUsage } from "./lib/useUsage";
import { useAutoScroll } from "./lib/useAutoScroll";

/** Flatten a message's text blocks into a single string. */
function messageText(msg: ChatMessage): string {
  return msg.content
    .map((b: ContentBlock) =>
      b.type === "text" && typeof b.text === "string" ? b.text : ""
    )
    .join("")
    .trim();
}

/** Build the table-of-contents items: one per user message, paired with a
 *  snippet of the assistant reply that follows it. */
function buildToc(messages: ChatMessage[]): TocItem[] {
  const items: TocItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const userText = messageText(m);
    if (!userText) continue;
    // Next assistant message's text becomes the preview.
    let responsePreview = "";
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j].role === "assistant") {
        responsePreview = messageText(messages[j]).slice(0, 240);
        break;
      }
    }
    items.push({ id: m.uuid, userText, responsePreview });
  }
  return items;
}

/**
 * Top-level client shell: loads projects/sessions from the local server, holds
 * the active session transcript, and wires the sidebar + conversation +
 * sub-agents panel + composer together.
 */
export function ClientShell({ chatId }: { chatId?: string } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectSessionById = useSessionStore((s) => s.selectSessionById);

  // --- server-backed data + active chat (session store) ---
  // Real subscription usage, refreshed every minute (drives the sidebar ring).
  const { pctLeft: usagePctLeft } = useUsage();

  const projects = useSessionStore((s) => s.projects);
  const sessionsByProject = useSessionStore((s) => s.sessionsByProject);
  const active = useSessionStore((s) => s.active);
  const serverError = useSessionStore((s) => s.serverError);
  const loadProjects = useSessionStore((s) => s.loadProjects);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const selectSessionAction = useSessionStore((s) => s.selectSession);
  const newChat = useSessionStore((s) => s.newChat);
  const newChatCwd = useSessionStore((s) => s.newChatCwd);
  const sendMessage = useSessionStore((s) => s.sendMessage);
  const enqueueMessage = useSessionStore((s) => s.enqueueMessage);
  const removeQueued = useSessionStore((s) => s.removeQueued);
  const steerMessage = useSessionStore((s) => s.steerMessage);
  const queued = useQueued(active?.sessionId);
  const transcript = useActiveTranscript() ?? null;
  const streaming = useStreaming(active?.sessionId);
  // The working directory to send in: the loaded transcript's cwd for an
  // existing chat, else the derived new-chat cwd, else any sibling session's
  // cwd in the active project, else the project's decoded path.
  const activeCwd = useMemo(() => {
    if (transcript?.cwd) return transcript.cwd;
    if (!active) return undefined;
    if (newChatCwd) return newChatCwd;
    const sibling = sessionsByProject[active.projectId]?.find((s) => s.cwd)?.cwd;
    if (sibling) return sibling;
    return projects.find((p) => p.id === active.projectId)?.path;
  }, [transcript?.cwd, active, newChatCwd, sessionsByProject, projects]);

  // --- global chrome (ui store) ---
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);
  const rightPanelFull = useUiStore((s) => s.rightPanelFull);
  const bottomPanelOpen = useUiStore((s) => s.bottomPanelOpen);
  const expanded = useUiStore((s) => s.expanded);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setRightPanelOpen = useUiStore((s) => s.setRightPanelOpen);
  const setRightPanelFull = useUiStore((s) => s.setRightPanelFull);
  const toggleBottomPanel = useUiStore((s) => s.toggleBottomPanel);
  const setBottomPanelOpen = useUiStore((s) => s.setBottomPanelOpen);
  const toggleProjectExpanded = useUiStore((s) => s.toggleProjectExpanded);
  const setProjectExpanded = useUiStore((s) => s.setProjectExpanded);

  // --- transient, presentational (stays local) ---
  const [activeAgentId, setActiveAgentId] = useState<string | undefined>();
  const [previewFile, setPreviewFile] = useState<{
    name: string;
    url: string;
    mime: string;
  } | null>(null);
  const sending = streaming?.active ?? false;

  // Left sidebar drag-resize. The committed width lives in the store; only the
  // in-progress drag state is local. Clamped to [LEFT_MIN, LEFT_MAX].
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const sidebarDrag = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );
  const onSidebarPointerMove = useCallback(
    (e: PointerEvent) => {
      const s = sidebarDrag.current;
      if (!s) return;
      // Handle is on the RIGHT edge: dragging right widens.
      const w = s.startWidth + (e.clientX - s.startX);
      setSidebarWidth(Math.min(LEFT_MAX_WIDTH, Math.max(LEFT_MIN_WIDTH, w)));
    },
    [setSidebarWidth],
  );
  const onSidebarPointerUp = useCallback(() => {
    sidebarDrag.current = null;
    setSidebarDragging(false);
    window.removeEventListener("pointermove", onSidebarPointerMove);
    window.removeEventListener("pointerup", onSidebarPointerUp);
  }, [onSidebarPointerMove]);
  const onSidebarHandleDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      sidebarDrag.current = { startX: e.clientX, startWidth: sidebarWidth };
      setSidebarDragging(true);
      window.addEventListener("pointermove", onSidebarPointerMove);
      window.addEventListener("pointerup", onSidebarPointerUp);
    },
    [sidebarWidth, onSidebarPointerMove, onSidebarPointerUp],
  );

  // Transcript scroll container — observed by the table-of-contents rail.
  const scrollRef = useRef<HTMLDivElement>(null);
  const resolveAnchor = useCallback(
    (id: string) =>
      scrollRef.current?.querySelector<HTMLElement>(
        `[data-msg-id="${CSS.escape(id)}"]`
      ) ?? null,
    []
  );

  // Load projects (+ prefetch sessions) once on mount. The store dedupes so
  // revisiting `/` after a route change doesn't refetch what's already cached.
  useEffect(() => {
    if (projects.length === 0) loadProjects();
  }, [projects.length, loadProjects]);

  // Re-fetch the active session's transcript on mount / when it changes, so a
  // reload that restored `active` from localStorage repopulates the view.
  useEffect(() => {
    if (active?.sessionId && !transcript) {
      selectSessionAction(active.projectId, active.sessionId);
    }
  }, [active?.projectId, active?.sessionId, transcript, selectSessionAction]);

  // ⌘B toggles the left sidebar; ⌘J the bottom panel; ⌘, opens Settings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        router.push("/settings");
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        toggleBottomPanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, toggleSidebar, toggleBottomPanel]);

  const toggleProject = useCallback(
    (id: string) => {
      toggleProjectExpanded(id);
      loadSessions(id);
    },
    [toggleProjectExpanded, loadSessions]
  );

  // Selecting a session just navigates to its URL (`/[sessionId]`); the URL is
  // the source of truth. The sync effect below turns that into an active
  // session. We optimistically set active too so the view switches instantly,
  // before the route transition settles.
  const selectSession = useCallback(
    (projectId: string, sessionId: string) => {
      setActiveAgentId(undefined);
      selectSessionAction(projectId, sessionId);
      router.push(`/${sessionId}`);
    },
    [selectSessionAction, router]
  );

  // URL → active session. When the route carries a `chatId` (`/[sessionId]`)
  // that isn't already active, resolve its project and open it. This makes the
  // URL shareable and makes a reload land on the right chat.
  //
  // Resolution needs the owning project's sessions loaded. On a cold reload
  // straight onto `/[sessionId]` those arrive asynchronously (loadProjects
  // prefetches them), so this effect also depends on `sessionsByProject` and
  // re-runs as data lands — retrying resolution until the session is found,
  // instead of giving up after a fixed delay.
  useEffect(() => {
    if (!chatId) return;
    if (active?.sessionId === chatId) return;
    selectSessionById(chatId);
  }, [chatId, active?.sessionId, sessionsByProject, selectSessionById]);

  // active → URL, but ONLY when we're on `/` (no chatId in the address). The
  // URL is authoritative whenever it names a chat: if a `chatId` is present the
  // URL→active effect above owns reconciliation, and this effect must NOT push
  // back (otherwise a page opened at /[A] while `active` was persisted as [B]
  // would bounce A→B). This still handles the two cases that need it:
  //   - resuming the last chat: land on `/`, persisted `active` → push /[id].
  //   - a brand-new chat minting its id on first send while on `/`.
  useEffect(() => {
    if (chatId) return; // URL already names a chat — it wins.
    const sid = active?.sessionId;
    if (!sid) return; // empty id = unsent new chat; keep `/`.
    router.replace(`/${sid}`);
  }, [active?.sessionId, chatId, router]);

  // Open a session requested via ?project=&session= (legacy cross-route handoff).
  useEffect(() => {
    const projectId = searchParams.get("project");
    const sessionId = searchParams.get("session");
    if (!projectId || !sessionId) return;
    if (active?.sessionId === sessionId) return;
    selectSession(projectId, sessionId);
    router.replace(`/${sessionId}`);
  }, [searchParams, active?.sessionId, selectSession, router]);

  // Recents: newest sessions across all loaded projects (excluding archived).
  const recents = useMemo(() => {
    const all = Object.values(sessionsByProject).flat();
    return all
      .filter((s) => !s.archived)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6);
  }, [sessionsByProject]);

  // Pinned: sessions the user has explicitly pinned (real flag from meta store).
  const pinned = useMemo(() => {
    const all = Object.values(sessionsByProject).flat();
    return all
      .filter((s) => s.pinned && !s.archived)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [sessionsByProject]);

  const activeAgent = transcript?.agents.find(
    (a) => a.agentId === activeAgentId
  );

  // The active session's sidebar metadata (pinned / archived), for the chat
  // header's ⋯ options menu.
  const activeSession = useMemo(() => {
    if (!active?.sessionId) return undefined;
    return sessionsByProject[active.projectId]?.find(
      (s) => s.id === active.sessionId
    );
  }, [active?.projectId, active?.sessionId, sessionsByProject]);

  // Table-of-contents ticks (one per user turn) + the first PR URL referenced in
  // the transcript, both derived from the loaded messages.
  const toc = useMemo(
    () => (transcript ? buildToc(transcript.messages) : []),
    [transcript]
  );
  const prRef = useMemo(() => {
    for (const m of transcript?.messages ?? []) {
      if (m.role !== "user") continue;
      const hit = extractPrUrl(messageText(m));
      if (hit) return { ...hit, title: messageText(m).slice(0, 80) };
    }
    return null;
  }, [transcript]);

  // Auto-scroll the transcript: jump to bottom on open, stay pinned while a
  // response streams (unless the user scrolled up), and expose a "jump to
  // bottom" button + flag when the user isn't at the bottom.
  const streamActive = streaming?.active ?? false;
  const contentSignal = `${transcript?.messages.length ?? 0}:${
    streamActive ? streaming?.text.length ?? 0 : 0
  }`;
  const { atBottom, scrollToBottom } = useAutoScroll({
    scrollRef,
    contentSignal,
    conversationKey: active?.sessionId ?? null,
  });

  const onSend = useCallback(
    async (p: {
      text: string;
      images: string[];
      model: string;
      permissionMode: string;
    }) => {
      // Need a project + cwd to run the CLI. cwd comes from the loaded
      // transcript (existing chat) or the derived new-chat cwd (fresh chat).
      if (!active || !activeCwd) return;
      // If a turn is already generating, QUEUE this message — it auto-sends as
      // the next turn (or the user can "Steer" it to send immediately).
      if (streaming?.active && active.sessionId) {
        enqueueMessage(active.sessionId, {
          text: p.text,
          images: p.images,
          model: p.model,
          permissionMode: p.permissionMode,
        });
        return;
      }
      await sendMessage({
        projectId: active.projectId,
        sessionId: active.sessionId || undefined,
        cwd: activeCwd,
        text: p.text,
        images: p.images,
        model: p.model,
        permissionMode: p.permissionMode,
      });
    },
    [active, activeCwd, streaming?.active, enqueueMessage, sendMessage]
  );

  // Queue actions: steer sends a queued message immediately (interrupt the
  // running turn); remove drops it. Both need the active session + cwd.
  const onSteer = useCallback(
    (id: string) => {
      if (!active?.sessionId || !activeCwd) return;
      void steerMessage(active.projectId, active.sessionId, activeCwd, id);
    },
    [active, activeCwd, steerMessage]
  );
  const onRemoveQueued = useCallback(
    (id: string) => {
      if (active?.sessionId) removeQueued(active.sessionId, id);
    },
    [active?.sessionId, removeQueued]
  );

  // Stable handlers so the memoized sidebar / panels don't re-render when
  // ClientShell re-renders for unrelated state (streaming tokens, drafts, drags).
  const handleNewChat = useCallback(() => {
    // Start a fresh chat in the current project, or the most recent one so the
    // composer always has a working directory to run in.
    const pid = active?.projectId ?? projects[0]?.id;
    if (pid) loadSessions(pid);
    newChat(pid);
    // A new chat has no session id yet — its URL is `/` until the first send
    // mints one (then the active→URL effect updates the address).
    router.push("/");
  }, [active?.projectId, projects, loadSessions, newChat, router]);

  const handleNewChatInProject = useCallback(
    (pid: string) => {
      // "New chat in THIS folder" — from the project row's ⊕ button.
      loadSessions(pid);
      setProjectExpanded(pid, true);
      newChat(pid);
      router.push("/");
    },
    [loadSessions, setProjectExpanded, newChat, router]
  );

  const handleOpenAgent = useCallback(
    (id: string) => setActiveAgentId(id),
    []
  );
  const handleToggleRightPanel = useCallback(
    () => setRightPanelOpen(!rightPanelOpen),
    [setRightPanelOpen, rightPanelOpen]
  );
  const handleCloseBottomPanel = useCallback(
    () => setBottomPanelOpen(false),
    [setBottomPanelOpen]
  );
  const handleOpenInPanel = useCallback(
    (f: { name: string; url: string; mime: string }) => {
      setPreviewFile(f);
      setRightPanelOpen(true);
    },
    [setRightPanelOpen]
  );

  return (
    <TooltipProvider>
    <div className="flex h-dvh w-full overflow-hidden bg-app-bg text-text-strong">
      {/* Left sidebar. Kept mounted and animated (width → 0) on ⌘B so it slides
          out instead of vanishing; the inner width is pinned so its contents
          don't reflow mid-animation. Width is adjustable via the right-edge
          handle and persisted in the store. */}
      <div
        aria-hidden={sidebarCollapsed}
        className="relative h-full shrink-0 overflow-hidden"
        style={{
          width: sidebarCollapsed ? 0 : sidebarWidth,
          pointerEvents: sidebarCollapsed ? "none" : undefined,
          transition: sidebarDragging
            ? "none"
            : "width 300ms var(--ease-out-quart)",
        }}
      >
        <div style={{ width: sidebarWidth }} className="h-full">
        <SessionSidebar
          projects={projects}
          sessionsByProject={sessionsByProject}
          recents={recents}
          pinned={pinned}
          activeSessionId={active?.sessionId}
          expanded={expanded}
          onToggleProject={toggleProject}
          onSelectSession={selectSession}
          onNewChat={handleNewChat}
          onNewChatInProject={handleNewChatInProject}
          usagePctLeft={usagePctLeft}
        />
        </div>

        {/* Right-edge resize handle — drag to adjust the sidebar width. */}
        {!sidebarCollapsed ? (
          <button
            type="button"
            aria-label="Resize sidebar"
            onPointerDown={onSidebarHandleDown}
            className="group absolute inset-y-0 right-0 z-10 flex w-2 cursor-col-resize touch-none items-center justify-center focus:outline-none"
          >
            <span
              className={
                "h-full w-px transition-colors duration-150 ease-out " +
                (sidebarDragging
                  ? "bg-[var(--primary)]"
                  : "bg-transparent group-hover:bg-[var(--primary)]")
              }
            />
          </button>
        ) : null}
      </div>

      {/* Chat + right panel + bottom panel. A vertical stack: the top row is the
          chat column beside the right panel (horizontal), and the bottom panel
          sits below BOTH — so it spans the chat area plus the right sidebar, but
          not the left sidebar. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Main conversation column. In full-width mode it animates its flex-grow
          to 0 (collapsing to width 0 via flex-basis:0 + min-w-0 + overflow) so
          the right panel — which grows to flex-1 — smoothly expands to fill.
          Kept mounted so the transition runs; hidden from a11y when collapsed. */}
      <div
        aria-hidden={rightPanelFull}
        className="flex min-w-0 flex-col overflow-hidden transition-[flex-grow] duration-300 ease-[var(--ease-out-quart)]"
        style={{
          // `flex` shorthand only (no flex-* longhand) → no shorthand/longhand
          // React warning. Grow 1 normally; 0 when the right panel is full-width
          // (basis 0 + min-w-0 + overflow lets it collapse to zero smoothly).
          flex: rightPanelFull ? "0 1 0px" : "1 1 0px",
          pointerEvents: rightPanelFull ? "none" : undefined,
        }}
      >
        <ChatNav
          title={transcript?.title ?? "Claude Client"}
          projectId={active?.projectId}
          sessionId={active?.sessionId}
          pinned={activeSession?.pinned}
          archived={activeSession?.archived}
          rightPanelOpen={rightPanelOpen}
          onToggleRightPanel={handleToggleRightPanel}
          bottomPanelOpen={bottomPanelOpen}
          onToggleBottomPanel={toggleBottomPanel}
        />
        <div className="relative flex flex-1 overflow-hidden">
          {/* Table-of-contents rail, overlaid on the left edge of the
              transcript so it doesn't push the content and stays fixed while
              the transcript scrolls underneath. Vertically centered. */}
          {transcript && toc.length > 0 ? (
            <div className="pointer-events-none absolute inset-y-0 left-0 z-30 flex items-center pl-2">
              <div className="pointer-events-auto">
                <TocRail
                  items={toc}
                  scrollRef={scrollRef}
                  resolveAnchor={resolveAnchor}
                />
              </div>
            </div>
          ) : null}

          {/* Scrollable transcript. Extra bottom padding reserves space so the
              last messages can scroll up ABOVE the floating composer instead of
              being hidden behind it. */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto pb-[180px]">
            {serverError ? (
              <div className="mx-auto max-w-[832px] px-8 py-6 text-sm text-text-secondary">
                Couldn&apos;t reach the local server. Start it with{" "}
                <code className="rounded bg-code-bg px-1 font-mono">
                  ./start.sh
                </code>
                . <span className="opacity-60">({serverError})</span>
              </div>
            ) : transcript ? (
              <>
                {prRef ? (
                  <div className="mx-auto max-w-[896px] px-8 pt-4">
                    <PrCard
                      title={prRef.title}
                      url={prRef.url}
                      repo={prRef.repo}
                      number={prRef.number}
                    />
                  </div>
                ) : null}
                <MessageList
                  messages={transcript.messages}
                  onOpenAgent={handleOpenAgent}
                  streamingText={
                    streaming?.active ? streaming.text : undefined
                  }
                  pendingUserText={
                    streaming?.active ? streaming.pendingUserText : undefined
                  }
                  runningTool={
                    streaming?.active ? streaming.runningTool ?? null : null
                  }
                />
              </>
            ) : active ? (
              <div className="flex h-full items-center justify-center text-sm text-text-secondary">
                New chat — type a message below to begin.
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-secondary">
                Select a session, or start a new chat.
              </div>
            )}
          </div>

          {/* "Scroll to bottom" pill — shown only when the user has scrolled up
              away from the latest messages. Centered just above the composer. */}
          {transcript && !atBottom ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-[150px] z-30 flex justify-center">
              <button
                type="button"
                aria-label="Scroll to bottom"
                onClick={() => scrollToBottom("smooth")}
                className="pointer-events-auto flex size-8 items-center justify-center rounded-full border border-panel-border bg-panel-bg/90 text-text-secondary shadow-md backdrop-blur transition-colors hover:bg-nav-active-bg hover:text-text-primary"
              >
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M8 3v10M3.5 8.5 8 13l4.5-4.5"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          ) : null}

          {/* Composer floats on top of the transcript (which scrolls behind it).
              Its backdrop blur keeps it readable over the content underneath. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
            <div className="pointer-events-auto">
              {/* Queued messages (send-while-generating), stacked above the input,
                  aligned to the composer's inner max-width. */}
              {queued.length ? (
                <div className="mx-auto w-full max-w-[896px] px-8">
                  <QueuedMessages
                    messages={queued}
                    onSteer={onSteer}
                    onRemove={onRemoveQueued}
                  />
                </div>
              ) : null}
              <RichComposer
                onSend={onSend}
                // Hard-disable only when there's no session/cwd to run in. While
                // a turn generates, typing stays enabled so sends QUEUE.
                disabled={!active || !activeCwd}
                isGenerating={sending}
                cwd={activeCwd}
                sessionId={active?.sessionId}
                gitBranch={transcript?.gitBranch}
                onOpenInPanel={handleOpenInPanel}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right: resizable tabbed panel (Review / Terminal / Browser / Files /
          Side chat). Fully hidden when toggled off — toggle lives in ChatNav. */}
      <RightPanel
        cwd={transcript?.cwd}
        open={rightPanelOpen}
        onOpenChange={setRightPanelOpen}
        onFullWidthChange={setRightPanelFull}
        bottomPanelOpen={bottomPanelOpen}
        onToggleBottomPanel={toggleBottomPanel}
        previewFile={previewFile}
        sessionId={active?.sessionId}
      />
        </div>

        {/* Bottom terminal panel — spans the chat column AND the right panel
            (everything except the left sidebar). Animated + height-adjustable. */}
        <BottomTerminalPanel
          open={bottomPanelOpen}
          cwd={transcript?.cwd}
          onClose={handleCloseBottomPanel}
          sessionId={active?.sessionId}
        />
      </div>
      {/* activeAgent handling retained for future wiring into the panel. */}
      {activeAgent ? null : null}
    </div>
    </TooltipProvider>
  );
}
