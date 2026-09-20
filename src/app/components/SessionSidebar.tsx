"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectSummary, SessionSummary } from "../lib/types";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  SearchIcon,
  BellIcon,
  EditIcon,
  PlusCircleIcon,
  FolderIcon,
  FolderOpenIcon,
  PluginsIcon,
  ClockIcon,
  CompassIcon,
  CodePullRequestIcon,
  CodeMergeIcon,
  CodeForkIcon,
} from "../chat/components/icons";
import { UsageRing } from "./UsageRing";
import { AccountMenu } from "./AccountMenu";
import { SessionRowMenu } from "./SessionRowMenu";
import { Tooltip } from "./ui/Tooltip";

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

/**
 * A session's git / PR state, driving the trailing glyph on its row. A plain
 * "branch" (or null) shows NO icon — only a merged / open-PR / forked state is
 * worth a glyph. The server doesn't send this yet, so `sessionGitStatus` mocks
 * it below.
 */
type GitStatus = "merged" | "open_pr" | "forked" | "branch" | null;

/**
 * MOCK git status for a session. Derives a stable pseudo-random state from the
 * id so the sidebar demonstrates the icon variation without a backend. Sessions
 * with no branch never get a status.
 * TODO: wire to real git status
 */
export function sessionGitStatus(session: SessionSummary): GitStatus {
  if (!session.gitBranch) return null;
  // Cheap stable hash of the id → a bucket, so the same session is consistent.
  let hash = 0;
  for (let i = 0; i < session.id.length; i++) {
    hash = (hash * 31 + session.id.charCodeAt(i)) | 0;
  }
  const bucket = Math.abs(hash) % 4;
  // 'branch' → no icon; the other three each get a distinct glyph/tint.
  return (["merged", "open_pr", "forked", "branch"] as const)[bucket];
}

/**
 * Trailing git glyph for a session row, or null when the status doesn't warrant
 * one. Each status has its own dedicated Nucleo glyph: an open PR is accented
 * (purple), a merge / fork is muted.
 */
function GitStatusIcon({ status }: { status: GitStatus }) {
  if (status === "open_pr") {
    return (
      <CodePullRequestIcon className="size-4 shrink-0 text-[color:var(--agent-accent)]" />
    );
  }
  if (status === "merged") {
    return <CodeMergeIcon className="size-4 shrink-0 icon-muted" />;
  }
  if (status === "forked") {
    return <CodeForkIcon className="size-4 shrink-0 icon-muted" />;
  }
  return null; // 'branch' | null → no icon
}

type SessionSidebarProps = {
  projects: ProjectSummary[];
  sessionsByProject: Record<string, SessionSummary[]>;
  recents: SessionSummary[];
  /** Sessions the user has pinned; rendered in the "Pinned" section. */
  pinned?: SessionSummary[];
  activeSessionId?: string;
  expanded: Record<string, boolean>;
  onToggleProject: (id: string) => void;
  onSelectSession: (projectId: string, sessionId: string) => void;
  onNewChat: () => void;
  /** Percentage of usage remaining, 0–100 (drives the footer ring). */
  usagePctLeft?: number;
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
      className="flex h-8 w-full items-center gap-2 rounded-[11.2px] px-2 text-left text-text-primary transition-colors duration-150 ease-out hover:bg-nav-active-bg/60"
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Icon className="size-4 icon-muted" />
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
    <div className="px-2.5 pb-1.5 pt-1">
      <p className="text-xs font-medium leading-4 text-text-secondary">
        {children}
      </p>
    </div>
  );
}

/**
 * A flat session row (used by Pinned + Recents + project children). Shows the
 * title plus a `trailing` slot (e.g. relative time), a status-driven git glyph,
 * and a hover/right-click "…" context menu. The whole row is a `group` so the
 * menu button can fade in on hover; right-click forwards to the same menu.
 */
function SessionRow({
  session,
  active,
  trailing,
  onSelect,
}: {
  session: SessionSummary;
  active: boolean;
  trailing?: React.ReactNode;
  onSelect: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const gitStatus = sessionGitStatus(session);
  const showGitIcon =
    gitStatus === "merged" ||
    gitStatus === "open_pr" ||
    gitStatus === "forked";

  return (
    <div
      className="group relative flex items-center"
      onContextMenu={(e) => {
        // Route native right-click to the same Base UI menu by clicking its
        // "…" trigger, which anchors the popup to that button.
        e.preventDefault();
        moreRef.current?.click();
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
        className={[
          "flex h-8 w-full items-center gap-2 rounded-[11.2px] px-2 text-left transition-colors duration-150 ease-out",
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
        {/* Trailing meta (e.g. time) hides while the "…" affordance is shown. */}
        {trailing ? (
          <span className="shrink-0 group-hover:opacity-0 group-focus-within:opacity-0">
            {trailing}
          </span>
        ) : null}
        {showGitIcon ? (
          <span className="shrink-0">
            <GitStatusIcon status={gitStatus} />
          </span>
        ) : null}
      </button>

      {/* Hover / right-click context menu, absolutely placed so it doesn't
          shift the row layout when it appears. */}
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
        <SessionRowMenu
          title={session.title}
          triggerRef={moreRef}
          open={menuOpen}
          onOpenChange={setMenuOpen}
        />
      </span>
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
  /** undefined = not loaded yet (fetching); [] = loaded but empty. */
  sessions: SessionSummary[] | undefined;
  isExpanded: boolean;
  activeSessionId?: string;
  onToggle: () => void;
  onSelectSession: (projectId: string, sessionId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const loading = sessions === undefined;
  const list = sessions ?? [];
  const hasOverflow = list.length > MAX_VISIBLE_SESSIONS;
  // Always-visible rows vs. the overflow rows, which slide in/out beneath them.
  const alwaysVisible = hasOverflow
    ? list.slice(0, MAX_VISIBLE_SESSIONS)
    : list;
  const overflow = hasOverflow ? list.slice(MAX_VISIBLE_SESSIONS) : [];

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex h-8 w-full items-center gap-2 rounded-[11.2px] px-2 text-left text-text-secondary transition-colors duration-150 ease-out hover:bg-nav-active-bg/60"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {/* One chevron that rotates — smooth, no glyph swap. */}
          <ChevronRightIcon
            className="size-4 icon-muted transition-transform duration-200"
            style={{
              transitionTimingFunction: "var(--ease-out-quart)",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            }}
          />
        </span>
        {isExpanded ? (
          <FolderOpenIcon className="size-4 shrink-0 icon-muted" />
        ) : (
          <FolderIcon className="size-4 shrink-0 icon-muted" />
        )}
        <span className="flex-1 truncate text-sm font-medium leading-5">
          {project.name}
        </span>
      </button>

      {/* Animated expand/collapse via grid-template-rows 0fr → 1fr. */}
      <div
        className="grid transition-[grid-template-rows] duration-200"
        style={{
          transitionTimingFunction: "var(--ease-out-quart)",
          gridTemplateRows: isExpanded ? "1fr" : "0fr",
        }}
        aria-hidden={!isExpanded}
      >
        <div className="overflow-hidden">
          <div className="mt-0.5 flex flex-col gap-0.5 pl-4">
            {loading ? (
              <div className="flex h-8 items-center px-2 text-xs leading-5 text-text-faint">
                Loading…
              </div>
            ) : list.length === 0 ? (
              <div className="flex h-8 items-center px-2 text-xs leading-5 text-text-faint">
                No sessions found
              </div>
            ) : (
              <>
                {alwaysVisible.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    active={session.id === activeSessionId}
                    onSelect={() => onSelectSession(project.id, session.id)}
                  />
                ))}
                {hasOverflow ? (
                  <>
                    {/* Overflow rows animate in/out with the same
                        grid-template-rows 0fr → 1fr technique as the folder. */}
                    <div
                      className="grid transition-[grid-template-rows] duration-200"
                      style={{
                        transitionTimingFunction: "var(--ease-out-quart)",
                        gridTemplateRows: showAll ? "1fr" : "0fr",
                      }}
                      aria-hidden={!showAll}
                    >
                      <div className="overflow-hidden">
                        <div className="flex flex-col gap-0.5">
                          {overflow.map((session) => (
                            <SessionRow
                              key={session.id}
                              session={session}
                              active={session.id === activeSessionId}
                              onSelect={() =>
                                onSelectSession(project.id, session.id)
                              }
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAll((v) => !v)}
                      className="flex h-7 w-full items-center rounded-[11.2px] px-2 text-left text-xs font-medium text-text-secondary transition-colors duration-150 ease-out hover:bg-nav-active-bg/60"
                    >
                      {showAll
                        ? "Show less"
                        : `Show ${list.length - MAX_VISIBLE_SESSIONS} more`}
                    </button>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Sidebar footer: an "Options" button that opens the account menu, plus a
 *  circular usage indicator whose color reflects remaining headroom. */
function SidebarFooter({ usagePctLeft }: { usagePctLeft: number }) {
  return (
    <div className="mt-auto shrink-0 border-t border-panel-border p-2">
      <div className="flex items-center gap-2">
        <AccountMenu
          pctLeft={usagePctLeft}
          trigger={
            <button
              type="button"
              className="flex h-9 flex-1 items-center gap-2 rounded-[11.2px] px-2 text-left text-sm font-medium leading-5 text-text-primary outline-none transition-colors hover:bg-nav-active-bg/60 data-[popup-open]:bg-nav-active-bg"
            >
              <span className="flex-1 truncate">Options</span>
            </button>
          }
        />
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-text-secondary"
          title={`${Math.round(usagePctLeft)}% usage left`}
        >
          <UsageRing pctLeft={usagePctLeft} size={18} strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}

export function SessionSidebar({
  projects,
  sessionsByProject,
  recents,
  pinned = [],
  activeSessionId,
  expanded,
  onToggleProject,
  onSelectSession,
  onNewChat,
  usagePctLeft = 45,
}: SessionSidebarProps) {
  const router = useRouter();
  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r border-panel-border bg-app-bg">
      {/* Brand header */}
      <div className="flex h-11 shrink-0 items-center px-3">
        <span className="px-1 text-sm font-medium leading-5 text-text-strong">
          Claude
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip label="Search" shortcut="⌘K" side="bottom">
            <button
              type="button"
              aria-label="Search"
              className="flex size-7 items-center justify-center rounded-md icon-muted transition-[opacity,background-color] hover:bg-nav-active-bg/60 hover:opacity-100"
            >
              <SearchIcon className="size-4" />
            </button>
          </Tooltip>
          <Tooltip label="Notifications" side="bottom">
            <button
              type="button"
              aria-label="Notifications"
              className="flex size-7 items-center justify-center rounded-md icon-muted transition-[opacity,background-color] hover:bg-nav-active-bg/60 hover:opacity-100"
            >
              <BellIcon className="size-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 pb-2">
        {/* New chat + top-level nav */}
        <div className="flex flex-col gap-0.5">
          <NavRow
            icon={EditIcon}
            label="New chat"
            onClick={onNewChat}
            trailing={
              <PlusCircleIcon className="size-4 icon-muted" />
            }
          />
          <NavRow icon={CodePullRequestIcon} label="Pull requests" />
          <NavRow icon={ClockIcon} label="Scheduled" />
          <NavRow
            icon={PluginsIcon}
            label="Plugins"
            onClick={() => router.push("/plugins")}
          />
          <NavRow icon={CompassIcon} label="Explore" />
        </div>

        {/* Pinned */}
        {pinned.length > 0 ? (
          <div className="mt-4 flex flex-col">
            <SectionHeading>Pinned</SectionHeading>
            <div className="flex flex-col gap-0.5">
              {pinned.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  active={session.id === activeSessionId}
                  onSelect={() =>
                    onSelectSession(session.projectId, session.id)
                  }
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Projects */}
        {projects.length > 0 ? (
          <div className="mt-4 flex flex-col">
            <SectionHeading>Projects</SectionHeading>
            <div className="flex flex-col gap-0.5">
              {projects.map((project) => (
                <ProjectGroup
                  key={project.id}
                  project={project}
                  sessions={sessionsByProject[project.id]}
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
          <div className="mt-4 flex flex-col">
            <SectionHeading>Recents</SectionHeading>
            <div className="flex flex-col gap-0.5">
              {recents.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  active={session.id === activeSessionId}
                  onSelect={() =>
                    onSelectSession(session.projectId, session.id)
                  }
                  trailing={
                    <span className="text-[11px] leading-4 text-text-faint">
                      {relativeTime(session.updatedAt)}
                    </span>
                  }
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <SidebarFooter usagePctLeft={usagePctLeft} />
    </aside>
  );
}
