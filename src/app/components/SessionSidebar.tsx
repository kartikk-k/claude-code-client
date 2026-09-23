"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectSummary, SessionSummary } from "../lib/types";
import {
  useSessionStore,
  useSessionActivity,
  type SessionActivity,
} from "@/stores";
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
  CodeForkIcon,
  PinIcon,
  ArchiveIcon,
  LaptopIcon,
  DotsIcon,
  GearIcon,
  ChatBubblePlusIcon,
  FolderPointerIcon,
} from "../chat/components/icons";
import { UsageRing, usageColor } from "./UsageRing";
import { AccountMenu } from "./AccountMenu";
import { SessionRowMenu } from "./SessionRowMenu";
import { Tooltip } from "./ui/Tooltip";
import { SidebarHoverCard, type HoverMetaRow } from "./SidebarHoverCard";

/** Last path segment of a filesystem path, for cwd chips in hover cards. */
function cwdBasename(path: string): string {
  const parts = path.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

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
 * A session's git state, driving the trailing glyph on its row. Only a session
 * that is actually on a git branch is worth a glyph — everything else is null.
 */
type GitStatus = "branch" | null;

/**
 * Real git status for a session: driven purely by the `gitBranch` field the
 * server sends. If the session is on a branch we show the branch glyph;
 * otherwise no glyph. We intentionally do NOT fetch per-row git status (PR /
 * merge state) here — that would be far too expensive for a sidebar list.
 */
export function sessionGitStatus(session: SessionSummary): GitStatus {
  return session.gitBranch ? "branch" : null;
}

/**
 * Trailing git glyph for a session row, or null when the session isn't on a
 * branch. The branch/fork glyph is muted so it reads as ambient metadata.
 */
function GitStatusIcon({ status }: { status: GitStatus }) {
  if (status === "branch") {
    return <CodeForkIcon className="size-4 shrink-0 icon-muted" />;
  }
  return null;
}

/**
 * The per-session live-status glyph shown at the right of a row:
 *  - running:     a thin spinning ring (a turn is generating).
 *  - done-unseen: a solid blue dot (finished in the background, not yet opened).
 *  - needs-input: a circular exclamation (Claude is waiting on the user).
 * Rendered inline (no icon dependency) so the exact shapes match the reference.
 * Takes precedence over the git glyph when present.
 */
function SessionStatusIcon({ status }: { status: SessionActivity }) {
  if (status === "running") {
    return (
      <span
        className="flex size-4 shrink-0 items-center justify-center"
        role="status"
        aria-label="Working"
      >
        <svg
          width={15}
          height={15}
          viewBox="0 0 16 16"
          fill="none"
          className="animate-spin text-text-faint [animation-duration:0.9s]"
          aria-hidden
        >
          {/* faint full ring + a brighter arc that spins over it */}
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="1.6"
          />
          <path
            d="M8 2a6 6 0 0 1 6 6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }
  if (status === "done-unseen") {
    return (
      <span
        className="flex size-4 shrink-0 items-center justify-center"
        aria-label="Finished — unread"
      >
        <span className="size-2 rounded-full bg-[var(--primary)]" />
      </span>
    );
  }
  // needs-input → circular exclamation
  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center text-[var(--primary)]"
      aria-label="Needs your input"
    >
      <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M8 5v3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="8" cy="11" r="0.85" fill="currentColor" />
      </svg>
    </span>
  );
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
  /** Start a fresh chat in a specific project's working directory. */
  onNewChatInProject: (projectId: string) => void;
  /**
   * Percentage of usage remaining, 0–100 (drives the footer ring). `null` means
   * "not yet known" (still loading, or no usage source) — the footer shows a
   * neutral state instead of a fabricated number.
   */
  usagePctLeft?: number | null;
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

/** Small round hover-action button shown on a row's right edge on hover.
 *  When `active`, it renders in the accent color to reflect a toggled-on
 *  state (e.g. a pinned or archived session). */
function RowActionButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={[
        "flex size-6 items-center justify-center rounded-[7px] transition-[opacity,background-color,color] duration-150 ease-out hover:bg-nav-active-bg hover:opacity-100",
        active
          ? "text-[color:var(--agent-accent)] opacity-100"
          : "icon-muted",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/**
 * A flat session row (used by Pinned + Recents + project children). Hovering
 * reveals pin + archive action buttons on the right (replacing the trailing
 * meta), and — after a delay — a rich preview card (project / folder / branch).
 * Right-click opens the full context menu.
 */
function SessionRow({
  session,
  project,
  active,
  trailing,
  onSelect,
}: {
  session: SessionSummary;
  /** Owning project, for the hover card's metadata (optional). */
  project?: ProjectSummary;
  active: boolean;
  trailing?: React.ReactNode;
  onSelect: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const setPinned = useSessionStore((s) => s.setPinned);
  const setArchived = useSessionStore((s) => s.setArchived);
  const renameSession = useSessionStore((s) => s.renameSession);

  // Inline rename editor: replaces the title text with an <input> while active.
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(session.title);

  const startRename = () => {
    setDraftTitle(session.title);
    setRenaming(true);
  };
  const commitRename = () => {
    if (!renaming) return;
    const next = draftTitle.trim();
    if (next && next !== session.title) {
      renameSession(session.projectId, session.id, next);
    }
    setRenaming(false);
  };
  const cancelRename = () => {
    setDraftTitle(session.title);
    setRenaming(false);
  };
  // Focus + select the input when the editor opens.
  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  // Live status (running / done-unseen / needs-input) takes precedence over the
  // ambient git glyph.
  const activity = useSessionActivity(session.id);
  const gitStatus = sessionGitStatus(session);
  const showGitIcon = !activity && gitStatus === "branch";
  const showStatus = Boolean(activity);
  // The blue dot / needs-input glyph must stay visible even mid-hover (it's a
  // state the user needs to notice); only the git glyph and the plain time
  // hide behind the hover actions. A running spinner also stays visible.
  const statusPersists = activity === "done-unseen" || activity === "needs-input";

  const cardRows: HoverMetaRow[] = [];
  if (project) {
    cardRows.push({
      icon: <FolderIcon width={16} height={16} />,
      text: project.name,
    });
    cardRows.push({
      icon: <FolderPointerIcon width={16} height={16} />,
      text: cwdBasename(session.cwd ?? project.path),
      muted: true,
    });
  }
  if (session.gitBranch) {
    cardRows.push({
      icon: (
        <CodeForkIcon
          width={16}
          height={16}
          className="text-[color:var(--agent-accent)]"
        />
      ),
      text: session.gitBranch,
      muted: true,
    });
  }

  const row = (
    <div
      className="group relative flex items-center"
      onContextMenu={(e) => {
        e.preventDefault();
        moreRef.current?.click();
      }}
    >
      {renaming ? (
        // Inline rename editor — same footprint as the row button, styled with
        // the app tokens. Enter or blur commits, Escape cancels.
        <div
          className={[
            "flex h-8 w-full items-center gap-2 rounded-[11.2px] px-2",
            active ? "bg-nav-active-bg" : "bg-nav-active-bg",
          ].join(" ")}
        >
          <input
            ref={inputRef}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelRename();
              }
            }}
            aria-label="Rename session"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium leading-5 text-text-strong outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          aria-current={active ? "page" : undefined}
          className={[
            "flex h-8 w-full items-center gap-2 overflow-hidden rounded-[11.2px] px-2 text-left transition-colors duration-150 ease-out",
            active
              ? "bg-nav-active-bg text-text-strong"
              : "text-text-secondary hover:bg-nav-active-bg",
          ].join(" ")}
        >
          {/* Title fades out at the right edge (mask-image) instead of a hard
              ellipsis cut — matching the reference, which softly dissolves the
              overflow rather than chopping it. min-w-0 lets it actually shrink. */}
          <span
            className={[
              "min-w-0 flex-1 overflow-hidden whitespace-nowrap text-sm leading-5",
              "[mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]",
              "[-webkit-mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]",
              active ? "font-medium" : "",
            ].join(" ")}
          >
            {session.title}
          </span>
          {/* Live status glyph (spinner / blue dot / needs-input). Blue dot and
              needs-input persist through hover; the spinner does too. */}
          {showStatus ? (
            <span
              className={[
                "shrink-0",
                statusPersists
                  ? ""
                  : "group-hover:opacity-0 group-focus-within:opacity-0",
              ].join(" ")}
            >
              <SessionStatusIcon status={activity!} />
            </span>
          ) : null}
          {trailing ? (
            <span className="shrink-0 group-hover:opacity-0 group-focus-within:opacity-0">
              {trailing}
            </span>
          ) : null}
          {showGitIcon ? (
            <span className="shrink-0 group-hover:opacity-0 group-focus-within:opacity-0">
              <GitStatusIcon status={gitStatus} />
            </span>
          ) : null}
        </button>
      )}

      {/* Hover action buttons: pin + archive. A solid background (matching the
          hovered row) sits behind them so a long title is cleanly masked — no
          overlap. Hidden while inline-renaming so they don't cover the input. */}
      {!renaming ? (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 rounded-r-[11.2px] bg-nav-active-bg pl-2 pr-1.5 opacity-0 transition-opacity duration-150 ease-out group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          <RowActionButton
            label={session.pinned ? "Unpin" : "Pin"}
            active={session.pinned}
            onClick={() =>
              setPinned(session.projectId, session.id, !session.pinned)
            }
          >
            <PinIcon width={15} height={15} />
          </RowActionButton>
          <RowActionButton
            label={session.archived ? "Unarchive" : "Archive"}
            active={session.archived}
            onClick={() =>
              setArchived(session.projectId, session.id, !session.archived)
            }
          >
            <ArchiveIcon width={15} height={15} />
          </RowActionButton>
        </span>
      ) : null}

      {/* Full right-click context menu (hidden trigger anchored to the row). */}
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
        <SessionRowMenu
          projectId={session.projectId}
          sessionId={session.id}
          pinned={session.pinned}
          archived={session.archived}
          triggerRef={moreRef}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          onRename={startRename}
          onCopyTitle={() => navigator.clipboard.writeText(session.title)}
        />
      </span>
    </div>
  );

  return (
    <SidebarHoverCard
      title={session.title}
      titleIcon={<LaptopIcon width={16} height={16} />}
      trailing={relativeTime(session.updatedAt)}
      rows={cardRows}
      divider={false}
      side="right"
    >
      {row}
    </SidebarHoverCard>
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
  onNewChatInProject,
}: {
  project: ProjectSummary;
  /** undefined = not loaded yet (fetching); [] = loaded but empty. */
  sessions: SessionSummary[] | undefined;
  isExpanded: boolean;
  activeSessionId?: string;
  onToggle: () => void;
  onSelectSession: (projectId: string, sessionId: string) => void;
  /** Start a fresh chat in THIS project's working directory. */
  onNewChatInProject: (projectId: string) => void;
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

  const projectRow = (
    <div className="group relative flex items-center">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex h-8 w-full items-center gap-2 overflow-hidden rounded-[11.2px] px-2 text-left text-text-secondary transition-colors duration-150 ease-out hover:bg-nav-active-bg"
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
        <span className="min-w-0 flex-1 truncate text-sm font-medium leading-5">
          {project.name}
        </span>
      </button>

      {/* Hover actions: ⋯ (more) + edit — with a gradient mask so a long name
          truncates cleanly under the buttons (no overlap). */}
      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 rounded-r-[11.2px] pl-2 pr-1.5 opacity-0 transition-opacity duration-150 ease-out group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 bg-nav-active-bg">
        <RowActionButton label="Project options">
          <DotsIcon width={15} height={15} />
        </RowActionButton>
        <RowActionButton
          label="New chat in this project"
          onClick={() => onNewChatInProject(project.id)}
        >
          <ChatBubblePlusIcon width={15} height={15} />
        </RowActionButton>
      </span>
    </div>
  );

  return (
    <div className="flex flex-col">
      <SidebarHoverCard
        title={project.name}
        rows={[
          {
            icon: <ChatBubblePlusIcon width={16} height={16} />,
            text: `${project.sessionCount} ${
              project.sessionCount === 1 ? "task" : "tasks"
            }`,
          },
          {
            icon: <FolderIcon width={16} height={16} />,
            text: cwdBasename(project.path),
          },
          {
            icon: <FolderIcon width={16} height={16} />,
            text: project.path,
            muted: true,
          },
        ]}
        footer={{
          icon: <GearIcon width={16} height={16} />,
          label: "Edit project",
        }}
        side="right"
      >
        {projectRow}
      </SidebarHoverCard>

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
                    project={project}
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
                              project={project}
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
 *  circular usage indicator whose color reflects remaining headroom.
 *  `usagePctLeft === null` means usage isn't known yet — the ring renders an
 *  empty track and the tooltip says so, rather than showing a fake percentage. */
function SidebarFooter({ usagePctLeft }: { usagePctLeft: number | null }) {
  const known = usagePctLeft != null;
  const title = known
    ? `${Math.round(usagePctLeft)}% usage left`
    : "Usage unavailable";
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
          className="flex shrink-0 items-center gap-1.5 rounded-full text-text-secondary"
          title={title}
        >
          {/* Percent-left label sits to the LEFT of the ring, tinted to match. */}
          <span
            className="text-xs font-medium tabular-nums leading-none"
            style={known ? { color: usageColor(usagePctLeft) } : undefined}
          >
            {known ? `${Math.round(usagePctLeft)}%` : "—"}
          </span>
          {/* When unknown, draw an empty track (pctLeft 0 with no fill color). */}
          <UsageRing pctLeft={known ? usagePctLeft : 0} size={18} strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}

export const SessionSidebar = memo(function SessionSidebar({
  projects,
  sessionsByProject,
  recents,
  pinned = [],
  activeSessionId,
  expanded,
  onToggleProject,
  onSelectSession,
  onNewChat,
  onNewChatInProject,
  usagePctLeft = null,
}: SessionSidebarProps) {
  const router = useRouter();
  const projectById = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects]
  );
  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r border-panel-border bg-app-bg">
      {/* Brand header */}
      <div className="flex h-11 shrink-0 items-center px-3">
        <span className="px-1 text-sm font-medium leading-5 text-text-strong">
          Claude
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          {/* TODO: wire Search + Notifications (out of scope for this pass). */}
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
          <NavRow
            icon={CodePullRequestIcon}
            label="Pull requests"
            onClick={() => router.push("/pull-requests")}
          />
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
                  project={projectById[session.projectId]}
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
                  onNewChatInProject={onNewChatInProject}
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
                  project={projectById[session.projectId]}
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
});
