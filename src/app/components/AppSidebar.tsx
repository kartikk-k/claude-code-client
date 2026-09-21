"use client";

/**
 * AppSidebar — the ONE sidebar wrapper, driven entirely by the shared Zustand
 * stores. Used on routes that are NOT the main chat shell (e.g. /plugins,
 * /settings layouts). Because projects / sessions / expanded folders / pins all
 * live in the stores, the sidebar here shows the exact same state as the chat
 * view — expand a folder on /plugins and it stays expanded when you return to /.
 *
 * Selecting a session sets it active in the store and routes to "/" to show it.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore, useUiStore } from "@/stores";
import { SessionSidebar } from "./SessionSidebar";

export function AppSidebar() {
  const router = useRouter();

  const projects = useSessionStore((s) => s.projects);
  const sessionsByProject = useSessionStore((s) => s.sessionsByProject);
  const active = useSessionStore((s) => s.active);
  const loadProjects = useSessionStore((s) => s.loadProjects);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const selectSession = useSessionStore((s) => s.selectSession);
  const newChat = useSessionStore((s) => s.newChat);

  const expanded = useUiStore((s) => s.expanded);
  const toggleProjectExpanded = useUiStore((s) => s.toggleProjectExpanded);

  // Ensure projects are loaded (shared cache — no-op if the chat view already
  // populated them).
  useEffect(() => {
    if (projects.length === 0) loadProjects();
  }, [projects.length, loadProjects]);

  const toggleProject = useCallback(
    (id: string) => {
      toggleProjectExpanded(id);
      loadSessions(id);
    },
    [toggleProjectExpanded, loadSessions]
  );

  // Selecting a session sets it active in the store, then routes to the app.
  const onSelectSession = useCallback(
    (projectId: string, sessionId: string) => {
      selectSession(projectId, sessionId);
      router.push("/");
    },
    [selectSession, router]
  );

  const recents = useMemo(() => {
    const all = Object.values(sessionsByProject).flat();
    return all
      .filter((s) => !s.archived)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6);
  }, [sessionsByProject]);

  const pinned = useMemo(() => {
    const all = Object.values(sessionsByProject).flat();
    return all
      .filter((s) => s.pinned && !s.archived)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [sessionsByProject]);

  return (
    <SessionSidebar
      projects={projects}
      sessionsByProject={sessionsByProject}
      recents={recents}
      pinned={pinned}
      activeSessionId={active?.sessionId}
      expanded={expanded}
      onToggleProject={toggleProject}
      onSelectSession={onSelectSession}
      onNewChat={() => {
        newChat(active?.projectId);
        router.push("/");
      }}
      usagePctLeft={45}
    />
  );
}
