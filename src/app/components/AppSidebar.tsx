"use client";

/**
 * AppSidebar — a self-contained wrapper around <SessionSidebar> for routes that
 * are NOT the main app shell (e.g. /plugins). It loads its own projects/sessions
 * and, since those routes have no in-page transcript state, drives navigation by
 * routing back to the app ("/") with a ?session= param that ClientShell reads to
 * open the chosen session. This keeps the left sidebar present (and identical)
 * across the app, plugins, and any other top-level route.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";
import type { ProjectSummary, SessionSummary } from "../lib/types";
import { SessionSidebar } from "./SessionSidebar";

export function AppSidebar() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [sessionsByProject, setSessionsByProject] = useState<
    Record<string, SessionSummary[]>
  >({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Load projects, then prefetch each project's sessions so Pinned + Recents
  // populate without expanding a folder — same behavior as the main app shell.
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
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSessions = useCallback(
    async (projectId: string) => {
      if (sessionsByProject[projectId]) return;
      try {
        const s = await api.sessions(projectId);
        setSessionsByProject((m) => ({ ...m, [projectId]: s }));
      } catch {
        /* ignore — sidebar is a secondary surface here */
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

  // Selecting a session leaves this route and opens it in the main app.
  const selectSession = useCallback(
    (projectId: string, sessionId: string) => {
      router.push(
        `/?project=${encodeURIComponent(projectId)}&session=${encodeURIComponent(
          sessionId
        )}`
      );
    },
    [router]
  );

  const recents = useMemo(() => {
    const all = Object.values(sessionsByProject).flat();
    return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  }, [sessionsByProject]);

  const pinned = useMemo(() => {
    const all = Object.values(sessionsByProject).flat();
    return all
      .filter((s) => s.gitBranch)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3);
  }, [sessionsByProject]);

  return (
    <SessionSidebar
      projects={projects}
      sessionsByProject={sessionsByProject}
      recents={recents}
      pinned={pinned}
      expanded={expanded}
      onToggleProject={toggleProject}
      onSelectSession={selectSession}
      onNewChat={() => router.push("/")}
      usagePctLeft={45}
    />
  );
}
