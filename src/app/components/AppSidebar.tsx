"use client";

/**
 * AppSidebar — the ONE sidebar wrapper, driven entirely by the shared Zustand
 * stores. Used on routes that are NOT the main chat shell (e.g. /plugins,
 * /pull-requests, /settings layouts). Because projects / sessions / expanded
 * folders / pins all live in the stores, the sidebar here shows the exact same
 * state as the chat view — expand a folder on /plugins and it stays expanded
 * when you return to /.
 *
 * It is drag-resizable and ⌘B-collapsible using the SAME store fields as the
 * chat shell (`sidebarWidth` / `sidebarCollapsed`), so resizing it here and on
 * `/` stay in sync and persist. Selecting a session sets it active in the store
 * and routes to "/" to show it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useSessionStore,
  useUiStore,
  LEFT_MIN_WIDTH,
  LEFT_MAX_WIDTH,
} from "@/stores";
import { SessionSidebar } from "./SessionSidebar";
import { useUsage } from "../lib/useUsage";

export function AppSidebar() {
  const router = useRouter();

  // Real subscription usage, refreshed every minute (drives the sidebar ring).
  const { pctLeft: usagePctLeft } = useUsage();

  const projects = useSessionStore((s) => s.projects);
  const sessionsByProject = useSessionStore((s) => s.sessionsByProject);
  const active = useSessionStore((s) => s.active);
  const loadProjects = useSessionStore((s) => s.loadProjects);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const selectSession = useSessionStore((s) => s.selectSession);
  const newChat = useSessionStore((s) => s.newChat);

  const expanded = useUiStore((s) => s.expanded);
  const toggleProjectExpanded = useUiStore((s) => s.toggleProjectExpanded);
  const setProjectExpanded = useUiStore((s) => s.setProjectExpanded);

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

  // --- collapse + drag-resize (shared store; stays in sync with the chat shell) ---
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const s = drag.current;
      if (!s) return;
      // Handle is on the RIGHT edge: dragging right widens.
      const w = s.startWidth + (e.clientX - s.startX);
      setSidebarWidth(Math.min(LEFT_MAX_WIDTH, Math.max(LEFT_MIN_WIDTH, w)));
    },
    [setSidebarWidth],
  );
  const onPointerUp = useCallback(() => {
    drag.current = null;
    setDragging(false);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);
  const onHandleDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      drag.current = { startX: e.clientX, startWidth: sidebarWidth };
      setDragging(true);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [sidebarWidth, onPointerMove, onPointerUp],
  );

  // ⌘B toggles the sidebar here too, so the shortcut works on every route.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  // Outer box owns the (animated) width + collapse; the inner box is pinned to
  // the full width so contents don't reflow mid-animation. A right-edge handle
  // drives the resize. Mirrors the chat shell's sidebar exactly.
  return (
    <div
      aria-hidden={sidebarCollapsed}
      className="relative h-full shrink-0 overflow-hidden"
      style={{
        width: sidebarCollapsed ? 0 : sidebarWidth,
        pointerEvents: sidebarCollapsed ? "none" : undefined,
        transition: dragging ? "none" : "width 300ms var(--ease-out-quart)",
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
          onSelectSession={onSelectSession}
          onNewChat={() => {
            newChat(active?.projectId);
            router.push("/");
          }}
          onNewChatInProject={(pid) => {
            // New chat in THIS folder, then jump to the chat view.
            loadSessions(pid);
            setProjectExpanded(pid, true);
            newChat(pid);
            router.push("/");
          }}
          usagePctLeft={usagePctLeft}
        />
      </div>

      {/* Right-edge resize handle — drag to adjust the sidebar width. */}
      {!sidebarCollapsed ? (
        <button
          type="button"
          aria-label="Resize sidebar"
          onPointerDown={onHandleDown}
          className="group absolute inset-y-0 right-0 z-10 flex w-2 cursor-col-resize touch-none items-center justify-center focus:outline-none"
        >
          <span
            className={
              "h-full w-px transition-colors duration-150 ease-out " +
              (dragging
                ? "bg-[var(--primary)]"
                : "bg-transparent group-hover:bg-[var(--primary)]")
            }
          />
        </button>
      ) : null}
    </div>
  );
}
