"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, streamMessage } from "./lib/api";
import type {
  ChatMessage,
  ContentBlock,
  ProjectSummary,
  SessionSummary,
  SessionTranscript,
} from "./lib/types";
import { SessionSidebar } from "./components/SessionSidebar";
import { MessageList } from "./components/MessageList";
import { RightPanel } from "./components/RightPanel";
import { TocRail, type TocItem } from "./components/TocRail";
import { PrCard, extractPrUrl } from "./components/PrCard";
import { TooltipProvider } from "./components/ui/Tooltip";
import { RichComposer } from "./components/RichComposer";
import { ChatNav } from "./chat/components/ChatNav";

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
export function ClientShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [sessionsByProject, setSessionsByProject] = useState<
    Record<string, SessionSummary[]>
  >({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<{
    projectId: string;
    sessionId: string;
  } | null>(null);
  const [transcript, setTranscript] = useState<SessionTranscript | null>(null);
  const [activeAgentId, setActiveAgentId] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  // Right panel expanded to full width — the chat column is hidden so the
  // panel spans from the sidebar all the way to the window edge.
  const [rightPanelFull, setRightPanelFull] = useState(false);
  // Transcript scroll container — observed by the table-of-contents rail.
  const scrollRef = useRef<HTMLDivElement>(null);
  const resolveAnchor = useCallback(
    (id: string) =>
      scrollRef.current?.querySelector<HTMLElement>(
        `[data-msg-id="${CSS.escape(id)}"]`
      ) ?? null,
    []
  );

  // Load projects on mount, then prefetch every project's sessions so the
  // Pinned + Recents sections (derived from session data) populate immediately
  // — without waiting for the user to expand a folder first.
  useEffect(() => {
    let cancelled = false;
    api
      .projects()
      .then((ps) => {
        if (cancelled) return;
        setProjects(ps);
        for (const p of ps) {
          api
            .sessions(p.id)
            .then((s) => {
              if (!cancelled) {
                setSessionsByProject((m) =>
                  m[p.id] ? m : { ...m, [p.id]: s }
                );
              }
            })
            .catch((e) => setServerError(String(e)));
        }
      })
      .catch((e) => setServerError(String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // ⌘B toggles the left sidebar; ⌘, opens Settings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        setSidebarCollapsed((c) => !c);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        router.push("/settings");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const loadSessions = useCallback(
    async (projectId: string) => {
      if (sessionsByProject[projectId]) return;
      try {
        const s = await api.sessions(projectId);
        setSessionsByProject((m) => ({ ...m, [projectId]: s }));
      } catch (e) {
        setServerError(String(e));
      }
    },
    [sessionsByProject]
  );

  const toggleProject = useCallback(
    (id: string) => {
      setExpanded((e) => ({ ...e, [id]: !e[id] }));
      loadSessions(id);
    },
    [loadSessions]
  );

  const selectSession = useCallback(
    async (projectId: string, sessionId: string) => {
      setActive({ projectId, sessionId });
      setTranscript(null);
      setActiveAgentId(undefined);
      try {
        const t = await api.session(projectId, sessionId);
        setTranscript(t);
      } catch (e) {
        setServerError(String(e));
      }
    },
    []
  );

  // Open a session requested via ?project=&session= (e.g. after picking one
  // from the sidebar on the /plugins route). Runs once per distinct pair, then
  // clears the params so a refresh doesn't re-trigger it.
  useEffect(() => {
    const projectId = searchParams.get("project");
    const sessionId = searchParams.get("session");
    if (!projectId || !sessionId) return;
    if (active?.sessionId === sessionId) return;
    selectSession(projectId, sessionId);
    router.replace("/");
  }, [searchParams, active?.sessionId, selectSession, router]);

  // Recents: newest sessions across all loaded projects.
  const recents = useMemo(() => {
    const all = Object.values(sessionsByProject).flat();
    return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  }, [sessionsByProject]);

  // Pinned: placeholder until a real "pinned" flag exists — surface the most
  // recent sessions that have a git branch so the Pinned section is populated.
  const pinned = useMemo(() => {
    const all = Object.values(sessionsByProject).flat();
    return all
      .filter((s) => s.gitBranch)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3);
  }, [sessionsByProject]);

  const activeAgent = transcript?.agents.find(
    (a) => a.agentId === activeAgentId
  );

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

  const onSend = useCallback(
    async (p: {
      text: string;
      images: string[];
      model: string;
      permissionMode: string;
    }) => {
      if (!active || !transcript?.cwd) return;
      setSending(true);
      try {
        for await (const frame of streamMessage({
          cwd: transcript.cwd,
          sessionId: active.sessionId,
          prompt: p.text,
          images: p.images,
          model: p.model,
          permissionMode: p.permissionMode,
        })) {
          if (frame.event === "done") break;
        }
        // reload the transcript to show the appended turn
        const t = await api.session(active.projectId, active.sessionId);
        setTranscript(t);
      } catch (e) {
        setServerError(String(e));
      } finally {
        setSending(false);
      }
    },
    [active, transcript]
  );

  return (
    <TooltipProvider>
    <div className="flex h-dvh w-full overflow-hidden bg-app-bg text-text-strong">
      {/* Left sidebar. Kept mounted and animated (width → 0) on ⌘B so it slides
          out instead of vanishing; the inner width is pinned so its contents
          don't reflow mid-animation. */}
      <div
        aria-hidden={sidebarCollapsed}
        className="h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-[var(--ease-out-quart)]"
        style={{
          width: sidebarCollapsed ? 0 : 272,
          pointerEvents: sidebarCollapsed ? "none" : undefined,
        }}
      >
        <SessionSidebar
          projects={projects}
          sessionsByProject={sessionsByProject}
          recents={recents}
          pinned={pinned}
          activeSessionId={active?.sessionId}
          expanded={expanded}
          onToggleProject={toggleProject}
          onSelectSession={selectSession}
          onNewChat={() => {
            setActive(null);
            setTranscript(null);
          }}
          usagePctLeft={45}
        />
      </div>

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
          rightPanelOpen={rightPanelOpen}
          onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
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

          <div ref={scrollRef} className="flex-1 overflow-y-auto">
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
                  onOpenAgent={(id) => setActiveAgentId(id)}
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-secondary">
                Select a session to view its transcript.
              </div>
            )}
          </div>
        </div>
        <RichComposer
          onSend={onSend}
          disabled={sending || !active}
          cwd={transcript?.cwd}
          gitBranch={transcript?.gitBranch}
        />
      </div>

      {/* Right: resizable tabbed panel (Review / Terminal / Browser / Files /
          Side chat). Fully hidden when toggled off — toggle lives in ChatNav. */}
      <RightPanel
        cwd={transcript?.cwd}
        open={rightPanelOpen}
        onOpenChange={(next) => {
          setRightPanelOpen(next);
          if (!next) setRightPanelFull(false);
        }}
        onFullWidthChange={setRightPanelFull}
      />
      {/* activeAgent handling retained for future wiring into the panel. */}
      {activeAgent ? null : null}
    </div>
    </TooltipProvider>
  );
}
