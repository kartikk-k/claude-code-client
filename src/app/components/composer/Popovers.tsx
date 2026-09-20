"use client";

/**
 * Popover menus for the RichComposer.
 *
 * Exports:
 *  - Popover        shared absolute-positioned card wrapper
 *  - MenuRow        shared row (icon + title + description + trailing)
 *  - PermissionMenu approval-mode picker
 *  - SlashMenu      "/" command menu + skills
 *  - MentionMenu    "@" file picker
 *  - AddMenu        "+" add attachments / plugins menu
 *
 * Styling follows the aside-ui composer conventions and uses only the
 * globals.css theme tokens via Tailwind utilities. Icons come from the shared
 * chat icons set (stable base glyphs) plus the local popoverIcons.tsx additions.
 */

import {
  CheckIcon,
  ShieldIcon,
  SparkleIcon,
  AttachIcon,
} from "../../chat/components/icons";
import {
  AlertIcon,
  DocsIcon,
  LinkIcon,
  SplitIcon,
  StarIcon,
  ActivityIcon,
  CardIcon,
  TargetIcon,
  CompassIcon,
  RecordIcon,
} from "./popoverIcons";

/* -------------------------------------------------------------------------- */
/* Shared primitives                                                          */
/* -------------------------------------------------------------------------- */

/** Raised popover surface. Absolute-positioned by the parent via className. */
export function Popover({
  children,
  className = "",
  role = "menu",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role={role}
      className={[
        "absolute z-50 rounded-[16.8px] border border-popover-border bg-popover-bg p-1.5",
        "backdrop-blur-xl shadow-[0px_10px_30px_-5px_rgba(0,0,0,0.5)]",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

/** A single selectable row inside a popover. */
export function MenuRow({
  icon,
  title,
  titleNode,
  description,
  descriptionAlign = "right",
  trailing,
  active = false,
  accent = false,
  disabled = false,
  onClick,
}: {
  icon?: React.ReactNode;
  /** Plain title text (also used for keys / a11y). */
  title: string;
  /** Optional rich title (e.g. a highlighted match); falls back to `title`. */
  titleNode?: React.ReactNode;
  description?: string;
  /** Description sits to the right of the title, or beneath it. */
  descriptionAlign?: "right" | "below";
  trailing?: React.ReactNode;
  active?: boolean;
  /** Warning / destructive emphasis (orange-ish accent token). */
  accent?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const titleColor = accent
    ? "text-[color:var(--agent-accent)]"
    : disabled
      ? "text-text-faint"
      : "text-text-strong";
  // Icons dim via opacity (icon-* classes), never an alpha text color, so
  // overlapping strokes don't double up.
  const iconColor = accent
    ? "text-[color:var(--agent-accent)]"
    : disabled
      ? "icon-faint"
      : "icon-muted";

  const titleEl = (
    <span
      className={[
        "text-sm font-medium leading-5",
        descriptionAlign === "right" ? "shrink-0 whitespace-nowrap" : "truncate",
        titleColor,
      ].join(" ")}
    >
      {titleNode ?? title}
    </span>
  );

  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={[
        "flex w-full items-center gap-3 rounded-[11.2px] px-3 py-2 text-left transition-colors",
        disabled
          ? "cursor-default opacity-60"
          : "cursor-pointer hover:bg-nav-active-bg",
        active && !disabled ? "bg-nav-active-bg" : "",
      ].join(" ")}
    >
      {icon !== undefined ? (
        <span
          className={[
            "flex size-4 shrink-0 items-center justify-center",
            iconColor,
          ].join(" ")}
        >
          {icon}
        </span>
      ) : null}

      {descriptionAlign === "below" ? (
        <span className="flex min-w-0 flex-1 flex-col">
          {titleEl}
          {description ? (
            <span className="truncate text-xs leading-4 text-text-secondary">
              {description}
            </span>
          ) : null}
        </span>
      ) : (
        <>
          {titleEl}
          {description ? (
            <span className="ml-auto truncate pl-4 text-right text-xs leading-4 text-text-secondary">
              {description}
            </span>
          ) : null}
        </>
      )}

      {trailing !== undefined ? (
        <span
          className={[
            "shrink-0",
            // If nothing else pushed to the right, push the trailing element.
            descriptionAlign === "below" || !description ? "ml-auto" : "",
          ].join(" ")}
        >
          {trailing}
        </span>
      ) : null}
    </button>
  );
}

/** Section heading placed between groups of rows. */
function MenuHeading({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-3 pb-1 pt-2">
      <span className="text-xs font-medium leading-4 text-text-secondary">
        {children}
      </span>
      {right}
    </div>
  );
}

/** Small pill tag (e.g. "Personal") shown at the right edge of a row. */
function ScopeTag({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-control-border bg-control-bg px-2 py-0.5 text-[11px] font-medium leading-4 text-text-secondary">
      {label}
    </span>
  );
}

const activeCheck = (
  <CheckIcon width={16} height={16} className="text-text-strong" />
);

/* The permission-mode value, shared with the Base UI PermissionMenu in
 * ToolbarMenus.tsx (that dropdown replaced the old custom one here). */
export type PermissionValue = "plan" | "acceptEdits" | "bypassPermissions";

/* -------------------------------------------------------------------------- */
/* 1) SlashMenu                                                               */
/* -------------------------------------------------------------------------- */

export type SlashSkill = {
  name: string;
  description: string;
  scope?: string;
};

export type SlashItem =
  | { kind: "action"; id: string; title: string; description: string }
  | { kind: "skill"; skill: SlashSkill };

const SLASH_ACTIONS: {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "share",
    title: "Share thread",
    description: "Create a link to a snapshot of this thread",
    icon: <LinkIcon width={16} height={16} />,
  },
  {
    id: "side",
    title: "Side",
    description: "Start a temporary side chat",
    icon: <SplitIcon width={16} height={16} />,
  },
  {
    id: "star",
    title: "Star",
    description: "Pin or unpin the current chat",
    icon: <StarIcon width={16} height={16} />,
  },
  {
    id: "status",
    title: "Status",
    description: "Show chat ID, context usage, and rate limits",
    icon: <ActivityIcon width={16} height={16} />,
  },
  {
    id: "usage",
    title: "Usage & billing",
    description: "Open usage and billing settings",
    icon: <CardIcon width={16} height={16} />,
  },
];

const DEFAULT_SKILLS: SlashSkill[] = [
  {
    name: "commit",
    description: "Craft a conventional commit message",
    scope: "Personal",
  },
  {
    name: "review-pr",
    description: "Review the current pull request diff",
    scope: "Personal",
  },
  {
    name: "write-tests",
    description: "Generate tests for the selected code",
    scope: "Personal",
  },
];

/** Flat, ordered list of selectable slash items (actions then skills). The
 *  composer drives arrow-key navigation over this exact order. */
export function slashItems(skills: SlashSkill[] = DEFAULT_SKILLS): SlashItem[] {
  return [
    ...SLASH_ACTIONS.map(
      (a): SlashItem => ({
        kind: "action",
        id: a.id,
        title: a.title,
        description: a.description,
      })
    ),
    ...skills.map((skill): SlashItem => ({ kind: "skill", skill })),
  ];
}

export function SlashMenu({
  onPick,
  onClose,
  skills = DEFAULT_SKILLS,
  activeIndex = -1,
  className = "",
}: {
  onPick: (item: SlashItem) => void;
  onClose: () => void;
  skills?: SlashSkill[];
  /** Index into slashItems(skills) that is keyboard-highlighted. */
  activeIndex?: number;
  className?: string;
}) {
  return (
    <Popover className={["min-w-[360px]", className].join(" ")}>
      {SLASH_ACTIONS.map((a, i) => (
        <MenuRow
          key={a.id}
          icon={a.icon}
          title={a.title}
          description={a.description}
          descriptionAlign="right"
          active={i === activeIndex}
          onClick={() => {
            onPick({
              kind: "action",
              id: a.id,
              title: a.title,
              description: a.description,
            });
            onClose();
          }}
        />
      ))}

      <MenuHeading>Skills</MenuHeading>
      {skills.map((skill, i) => (
        <MenuRow
          key={skill.name}
          icon={<SparkleIcon width={16} height={16} />}
          title={skill.name}
          description={skill.description}
          descriptionAlign="right"
          active={SLASH_ACTIONS.length + i === activeIndex}
          trailing={skill.scope ? <ScopeTag label={skill.scope} /> : undefined}
          onClick={() => {
            onPick({ kind: "skill", skill });
            onClose();
          }}
        />
      ))}
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/* 3) MentionMenu                                                             */
/* -------------------------------------------------------------------------- */

export type MentionFile = {
  name: string;
  path?: string;
};

const DEFAULT_FILES: MentionFile[] = [
  { name: "README.md" },
  { name: "README.md", path: "e2e" },
  { name: "package.json" },
  { name: "tsconfig.json" },
  { name: "next.config.ts" },
  { name: "globals.css", path: "src/app" },
];

/** Highlights the portion of `text` matching `query` (case-insensitive). */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <span className="text-text-strong">{text}</span>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <span className="text-text-strong">{text}</span>;
  return (
    <span className="text-text-secondary">
      {text.slice(0, idx)}
      <span className="text-text-strong">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </span>
  );
}

/** Files matching the mention query, in display order. The composer drives
 *  arrow-key navigation over this exact filtered list. */
export function mentionMatches(
  query: string,
  files: MentionFile[] = DEFAULT_FILES
): MentionFile[] {
  const q = query.trim().toLowerCase();
  return q
    ? files.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.path ? f.path.toLowerCase().includes(q) : false)
      )
    : files;
}

export function MentionMenu({
  query,
  files = DEFAULT_FILES,
  onPick,
  onClose,
  activeIndex = -1,
  className = "",
}: {
  query: string;
  files?: MentionFile[];
  onPick: (file: MentionFile) => void;
  onClose: () => void;
  /** Index into mentionMatches(query, files) that is keyboard-highlighted. */
  activeIndex?: number;
  className?: string;
}) {
  const filtered = mentionMatches(query, files);

  return (
    <Popover className={["min-w-[300px]", className].join(" ")}>
      {filtered.length === 0 ? (
        <div className="px-3 py-2 text-sm leading-5 text-text-secondary">
          No files found
        </div>
      ) : (
        filtered.map((file, i) => (
          <MenuRow
            key={`${file.path ?? ""}/${file.name}`}
            icon={<DocsIcon width={16} height={16} />}
            title={file.name}
            titleNode={<Highlight text={file.name} query={query} />}
            active={i === activeIndex}
            trailing={
              file.path ? (
                <span className="truncate text-xs leading-4 text-text-faint">
                  {file.path}
                </span>
              ) : undefined
            }
            onClick={() => {
              onPick(file);
              onClose();
            }}
          />
        ))
      )}
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/* 4) AddMenu                                                                 */
/* -------------------------------------------------------------------------- */

export type AddPlugin = {
  id: string;
  name: string;
  description: string;
  icon?: React.ReactNode;
};

export type AddItem =
  | { kind: "action"; id: string; title: string }
  | { kind: "plugin"; plugin: AddPlugin };

const ADD_ACTIONS: {
  id: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  disabled?: boolean;
}[] = [
  {
    id: "files",
    title: "Files and folders",
    icon: <AttachIcon width={16} height={16} />,
  },
  {
    id: "appshot",
    title: "Attach appshot",
    icon: <DocsIcon width={16} height={16} />,
    disabled: true,
  },
  {
    id: "goal",
    title: "Goal",
    description: "Set a goal to keep pursuing",
    icon: <TargetIcon width={16} height={16} />,
  },
  {
    id: "plan",
    title: "Plan mode",
    description: "Turn plan mode on",
    icon: <CompassIcon width={16} height={16} />,
  },
  {
    id: "record",
    title: "Record a skill",
    icon: <RecordIcon width={16} height={16} />,
  },
];

const DEFAULT_PLUGINS: AddPlugin[] = [
  { id: "linear", name: "Linear", description: "Issues and projects" },
  { id: "documents", name: "Documents", description: "Reference your docs" },
  { id: "pdf", name: "PDF", description: "Read and extract from PDFs" },
  {
    id: "spreadsheets",
    name: "Spreadsheets",
    description: "Query rows and cells",
  },
];

/** Flat, ordered list of *selectable* add items (enabled actions, then
 *  plugins). Disabled actions are skipped so arrow-key nav lands only on
 *  actionable rows. The composer drives navigation over this exact order. */
export function addItems(plugins: AddPlugin[] = DEFAULT_PLUGINS): AddItem[] {
  return [
    ...ADD_ACTIONS.filter((a) => !a.disabled).map(
      (a): AddItem => ({ kind: "action", id: a.id, title: a.title })
    ),
    ...plugins.map((plugin): AddItem => ({ kind: "plugin", plugin })),
  ];
}

export function AddMenu({
  onPick,
  onClose,
  plugins = DEFAULT_PLUGINS,
  activeIndex = -1,
  className = "",
}: {
  onPick: (item: AddItem) => void;
  onClose: () => void;
  plugins?: AddPlugin[];
  /** Index into addItems(plugins) that is keyboard-highlighted. */
  activeIndex?: number;
  className?: string;
}) {
  // Map each rendered row to its index in the selectable addItems() list
  // (disabled rows get -1 so they never highlight).
  const enabledActions = ADD_ACTIONS.filter((a) => !a.disabled);
  const selectableIndexOfAction = (id: string) =>
    enabledActions.findIndex((a) => a.id === id);

  return (
    <Popover className={["min-w-[320px]", className].join(" ")}>
      <MenuHeading>Add</MenuHeading>
      {ADD_ACTIONS.map((a) => {
        const selIdx = a.disabled ? -1 : selectableIndexOfAction(a.id);
        return (
          <MenuRow
            key={a.id}
            icon={a.icon}
            title={a.title}
            description={a.description}
            descriptionAlign="right"
            disabled={a.disabled}
            active={selIdx === activeIndex}
            onClick={() => {
              onPick({ kind: "action", id: a.id, title: a.title });
              onClose();
            }}
          />
        );
      })}

      <MenuHeading>Plugins</MenuHeading>
      {plugins.map((plugin, i) => (
        <MenuRow
          key={plugin.id}
          icon={plugin.icon ?? <SparkleIcon width={16} height={16} />}
          title={plugin.name}
          description={plugin.description}
          descriptionAlign="right"
          active={enabledActions.length + i === activeIndex}
          onClick={() => {
            onPick({ kind: "plugin", plugin });
            onClose();
          }}
        />
      ))}
    </Popover>
  );
}
