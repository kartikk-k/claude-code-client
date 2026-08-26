"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, streamMessage } from "./lib/api";
import type {
  ProjectSummary,
  SessionSummary,
  SessionTranscript,
} from "./lib/types";
import { SessionSidebar } from "./components/SessionSidebar";
import { MessageList } from "./components/MessageList";
import { AgentsPanel } from "./components/AgentsPanel";
import { RichComposer } from "./components/RichComposer";
import { ChatNav } from "./chat/components/ChatNav";

/**
 * Top-level client shell: loads projects/sessions from the local server, holds
 * the active session transcript, and wires the sidebar + conversation +
 * sub-agents panel + composer together.
 */
export function ClientShell() {
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
  const [agentsCollapsed, setAgentsCollapsed] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Load projects on mount.
  useEffect(() => {
    api
      .projects()
      .then(setProjects)
      .catch((e) => setServerError(String(e)));
  }, []);

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

  // Recents: newest sessions across all loaded projects.
  const recents = useMemo(() => {
    const all = Object.values(sessionsByProject).flat();
    return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  }, [sessionsByProject]);

  const activeAgent = transcript?.agents.find(
    (a) => a.agentId === activeAgentId
  );

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
    <div className="flex h-dvh w-full overflow-hidden bg-app-bg text-text-strong">
      <SessionSidebar
        projects={projects}
        sessionsByProject={sessionsByProject}
        recents={recents}
        activeSessionId={active?.sessionId}
        expanded={expanded}
        onToggleProject={toggleProject}
        onSelectSession={selectSession}
        onNewChat={() => {
          setActive(null);
          setTranscript(null);
        }}
      />

      {/* Main conversation column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ChatNav title={transcript?.title ?? "Claude Client"} />
        <div className="flex-1 overflow-y-auto">
          {serverError ? (
            <div className="mx-auto max-w-[832px] px-8 py-6 text-sm text-text-secondary">
              Couldn&apos;t reach the local server. Start it with{" "}
              <code className="rounded bg-code-bg px-1 font-mono">
                ./start.sh
              </code>
              . <span className="opacity-60">({serverError})</span>
            </div>
          ) : transcript ? (
            <MessageList
              messages={transcript.messages}
              onOpenAgent={(id) => {
                setActiveAgentId(id);
                setAgentsCollapsed(false);
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-text-secondary">
              Select a session to view its transcript.
            </div>
          )}
        </div>
        <RichComposer
          onSend={onSend}
          disabled={sending || !active}
          cwd={transcript?.cwd}
        />
      </div>

      {/* Right: sub-agents */}
      <AgentsPanel
        agents={transcript?.agents ?? []}
        activeAgentId={activeAgentId}
        onSelect={setActiveAgentId}
        collapsed={agentsCollapsed}
        onToggle={() => setAgentsCollapsed((c) => !c)}
      />
      {/* activeAgent transcript is rendered inside AgentsPanel via MessageList */}
      {activeAgent ? null : null}
    </div>
  );
}
