"use client";

import { useState } from "react";
import type { ProjectSummary, SessionSummary } from "../lib/types";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  SearchIcon,
  BellIcon,
  EditIcon,
  PlusCircleIcon,
  FolderIcon,
  PluginsIcon,
  ClockIcon,
  GitBranchIcon,
} from "../chat/components/icons";

/** Human-friendly relative time from an epoch-ms timestamp. */
export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return "now";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(day / 365)}y`;
}

type SessionSidebarProps = {
  projects: ProjectSummary[];
  sessionsByProject: Record<string, SessionSummary[]>;
  recents: SessionSummary[];
  activeSessionId?: string;
  expanded: Record<string, boolean>;
  onToggleProject: (id: string) => void;
  onSelectSession: (projectId: string, sessionId: string) => void;
  onNewChat: () => void;
  userName?: string;
};

/** Full-width nav row shared by the "New chat" + top-level items. */
function NavRow({
  icon: Icon,
  label,
  trailing,
  onClick,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full items-center gap-2 rounded-[11.2px] px-2 text-left text-text-primary transition-colors hover:bg-nav-active-bg"
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Icon className="size-4 text-text-secondary" />
      </span>
      <span className="flex-1 truncate text-sm font-medium leading-5">
        {label}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </button>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-1">
      <p className="text-xs font-medium leading-4 text-text-secondary">
        {children}
      </p>
    </div>
  );
}

const MAX_VISIBLE_SESSIONS = 5;

function ProjectGroup({
  project,
  sessions,
  isExpanded,
  activeSessionId,
  onToggle,
  onSelectSession,
}: {
  project: ProjectSummary;
  sessions: SessionSummary[];
  isExpanded: boolean;
  activeSessionId?: string;
  onToggle: () => void;
  onSelectSession: (projectId: string, sessionId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const hasOverflow = sessions.length > MAX_VISIBLE_SESSIONS;
  const visible =
    hasOverflow && !showAll
      ? sessions.slice(0, MAX_VISIBLE_SESSIONS)
      : sessions;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex h-8 w-full items-center gap-2 rounded-[11.2px] px-2 text-left text-text-secondary transition-colors hover:bg-nav-active-bg/60"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {isExpanded ? (
            <ChevronDownIcon className="size-4 text-text-secondary" />
          ) : (
            <ChevronRightIcon className="size-4 text-text-secondary" />
          )}
        </span>
        <FolderIcon className="size-4 shrink-0 text-text-secondary" />
        <span className="flex-1 truncate text-sm font-medium leading-5">
          {project.name}
        </span>
      </button>

      {isExpanded ? (
        <div className="flex flex-col pl-4">
          {visible.map((session) => {
            const active = session.id === activeSessionId;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelectSession(project.id, session.id)}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex h-8 w-full items-center gap-2 rounded-[11.2px] px-2 text-left transition-colors",
                  active
                    ? "bg-nav-active-bg text-text-strong"
                    : "text-text-secondary hover:bg-nav-active-bg/60",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex-1 truncate text-sm leading-5",
                    active ? "font-medium" : "",
                  ].join(" ")}
                >
                  {session.title}
                </span>
                {session.gitBranch ? (
                  <span className="flex max-w-[88px] shrink-0 items-center gap-1 rounded-md border border-control-border bg-control-bg px-1.5 py-0.5 text-[10px] leading-4 text-text-secondary">
                    <GitBranchIcon className="size-3 shrink-0 text-text-secondary" />
                    <span className="truncate">{session.gitBranch}</span>
                  </span>
                ) : null}
              </button>
            );
          })}
          {hasOverflow ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="flex h-7 w-full items-center rounded-[11.2px] px-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-nav-active-bg/60"
            >
              {showAll
                ? "Show less"
                : `Show ${sessions.length - MAX_VISIBLE_SESSIONS} more`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SessionSidebar({
  projects,
  sessionsByProject,
  recents,
  activeSessionId,
  expanded,
  onToggleProject,
  onSelectSession,
  onNewChat,
  userName = "You",
}: SessionSidebarProps) {
  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "Y";

  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r border-panel-border bg-app-bg">
      {/* Brand header */}
      <div className="flex h-11 shrink-0 items-center gap-1 px-3">
        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-1 py-0.5 text-text-strong transition-colors hover:bg-nav-active-bg/60"
        >
          <span className="text-sm font-medium leading-5">Claude</span>
          <ChevronDownIcon className="size-4 text-text-secondary" />
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Search"
            className="flex size-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-nav-active-bg/60 hover:text-text-strong"
          >
            <SearchIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Notifications"
            className="flex size-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-nav-active-bg/60 hover:text-text-strong"
          >
            <BellIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 pb-2">
        {/* New chat + top-level nav */}
        <div className="flex flex-col">
          <NavRow
            icon={EditIcon}
            label="New chat"
            onClick={onNewChat}
            trailing={
              <PlusCircleIcon className="size-4 text-text-secondary" />
            }
          />
          <NavRow icon={FolderIcon} label="Projects" />
          <NavRow icon={PluginsIcon} label="Plugins & MCPs" />
          <NavRow icon={ClockIcon} label="Routines" />
        </div>

        {/* Projects */}
        {projects.length > 0 ? (
          <div className="mt-3 flex flex-col">
            <SectionHeading>Projects</SectionHeading>
            <div className="flex flex-col">
              {projects.map((project) => (
                <ProjectGroup
                  key={project.id}
                  project={project}
                  sessions={sessionsByProject[project.id] ?? []}
                  isExpanded={Boolean(expanded[project.id])}
                  activeSessionId={activeSessionId}
                  onToggle={() => onToggleProject(project.id)}
                  onSelectSession={onSelectSession}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Recents */}
        {recents.length > 0 ? (
          <div className="mt-3 flex flex-col">
            <SectionHeading>Recents</SectionHeading>
            <div className="flex flex-col">
              {recents.map((session) => {
                const active = session.id === activeSessionId;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() =>
                      onSelectSession(session.projectId, session.id)
                    }
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex h-8 w-full items-center gap-2 rounded-[11.2px] px-2 text-left transition-colors",
                      active
                        ? "bg-nav-active-bg text-text-strong"
                        : "text-text-secondary hover:bg-nav-active-bg/60",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "flex-1 truncate text-sm leading-5",
                        active ? "font-medium" : "",
                      ].join(" ")}
                    >
                      {session.title}
                    </span>
                    <span className="shrink-0 text-[11px] leading-4 text-text-faint">
                      {relativeTime(session.updatedAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="mt-auto flex shrink-0 items-center gap-2 border-t border-panel-border p-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-control-bg text-xs font-medium text-text-strong">
          {initials}
        </span>
        <span className="flex-1 truncate text-sm font-medium leading-5 text-text-primary">
          {userName}
        </span>
        <button
          type="button"
          aria-label="Account options"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-nav-active-bg/60 hover:text-text-strong"
        >
          <ChevronDownIcon className="size-4" />
        </button>
      </div>
    </aside>
  );
}
