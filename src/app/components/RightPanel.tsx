"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
  ReviewIcon,
  TerminalTabIcon,
  FilesTabIcon,
  SideChatTabIcon,
  GlobeIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  RefreshIcon,
  AddTabIcon,
  XIcon,
  SortIcon,
  ChevronDownIcon,
  DotsIcon,
  PanelRightOpenIcon,
  ExpandFullIcon,
  BottomPanelOpenIcon,
  BottomPanelClosedIcon,
} from "../chat/components/icons";
import { Tooltip } from "./ui/Tooltip";
import { Menu, MenuItem } from "./ui/Menu";
import { CodeBlock } from "./blocks/CodeBlock";
import { TerminalView } from "./TerminalView";
import { BrowserTab } from "./BrowserTab";
import { api, type GitStatus, type GitFile, type FileEntry } from "../lib/api";
import { useChatLayout, useUiStore, type OpenTab, type RightTab } from "@/stores";

/**
 * A single changed file in the Review tab. Kept intentionally small and
 * prop-friendly so it can later be fed from real git-diff data.
 */
export type DiffFile = {
  path: string;
  added: number;
  removed: number;
  kind?: string;
};

/** The set of tab kinds. `'none'` renders the empty tab-list state.
 *  `'preview'` is dynamic — shown only when an attachment is opened. Mirrors
 *  `RightTab` from the ui store. */
type TabId = RightTab;

/** A tab kind that can appear as an actual open tab (everything but `none`). */
type TabKind = Exclude<RightTab, "none">;

/** Kinds the picker lets you open. `preview` is opened programmatically only. */
type PickerKind = Exclude<TabKind, "preview">;

/** Kinds that may have MULTIPLE simultaneous instances; all others are unique. */
const MULTI_INSTANCE: ReadonlySet<TabKind> = new Set(["browser", "terminal"]);

/** A file opened for preview in the right panel (from a composer attachment). */
export type PreviewFile = { name: string; url: string; mime: string };

type TabDef = {
  id: PickerKind;
  label: string;
  shortcut: string;
  Icon: (p: React.SVGProps<SVGSVGElement> & { size?: number }) => React.ReactElement;
};

const TABS: TabDef[] = [
  { id: "review", label: "Review", shortcut: "^⇧G", Icon: ReviewIcon },
  { id: "terminal", label: "Terminal", shortcut: "^`", Icon: TerminalTabIcon },
  { id: "browser", label: "Browser", shortcut: "⌘T", Icon: GlobeIcon },
  { id: "files", label: "Files", shortcut: "⌘P", Icon: FilesTabIcon },
  { id: "sidechat", label: "Side chat", shortcut: "⌥⌘S", Icon: SideChatTabIcon },
];

/** Icon + short label for any tab kind — drives header chips and preview. */
function tabMeta(
  kind: TabKind,
): {
  label: string;
  Icon: (p: React.SVGProps<SVGSVGElement> & { size?: number }) => React.ReactElement;
} {
  if (kind === "preview") return { label: "Preview", Icon: FileIcon };
  const def = TABS.find((t) => t.id === kind);
  return { label: def?.label ?? "", Icon: def?.Icon ?? ReviewIcon };
}

/** Create a reasonably-unique tab id (SSR-safe — no crypto/window at module scope). */
function newTabId(kind: TabKind): string {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const MIN_WIDTH = 320;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 420;

/** Realistic mock diff so the panel renders standalone. */
const MOCK_DIFF_FILES: DiffFile[] = [
  { path: "src/app/components/RightPanel.tsx", added: 24, removed: 0, kind: "tsx" },
  { path: "src/app/ClientShell.tsx", added: 12, removed: 4, kind: "tsx" },
  { path: "src/app/components/RichComposer.tsx", added: 9, removed: 1, kind: "tsx" },
  { path: "src/app/globals.css", added: 6, removed: 0, kind: "css" },
  { path: "src/app/lib/types.ts", added: 4, removed: 1, kind: "ts" },
  { path: "src/app/chat/components/icons.tsx", added: 3, removed: 0, kind: "tsx" },
  { path: "src/app/components/MessageList.tsx", added: 8, removed: 0, kind: "tsx" },
  { path: "package.json", added: 2, removed: 0, kind: "json" },
  { path: "README.md", added: 11, removed: 0, kind: "md" },
  { path: "src/app/lib/api.ts", added: 2, removed: 0, kind: "ts" },
];

const cx = (...parts: Array<string | false | undefined>) =>
  parts.filter(Boolean).join(" ");

export type RightPanelProps = {
  diffFiles?: DiffFile[];
  defaultTab?: TabId;
  /** Working directory of the active session — where the terminal opens. */
  cwd?: string;
  /** Whether the panel is shown at all. When false the panel animates its width
   *  to 0 and slides out (it stays mounted so the collapse animates). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Notifies the shell when the panel enters/leaves full-width mode, so the
   *  shell can hide the chat column and let the panel span the whole area. */
  onFullWidthChange?: (full: boolean) => void;
  /** Shared bottom-terminal-panel state, owned by the shell (the panel lives in
   *  the chat column now). The header's ⌘J button just toggles it. */
  bottomPanelOpen?: boolean;
  onToggleBottomPanel?: () => void;
  /** A file opened from a composer attachment — shown in the Preview tab. */
  previewFile?: PreviewFile | null;
  /** Active session id — keys the persisted per-chat width + tab. */
  sessionId?: string;
};

export function RightPanel({
  diffFiles = MOCK_DIFF_FILES,
  defaultTab = "none",
  cwd,
  open = true,
  onOpenChange,
  onFullWidthChange,
  bottomPanelOpen = false,
  onToggleBottomPanel,
  previewFile = null,
  sessionId,
}: RightPanelProps) {
  // Per-chat layout: seed width + tab from the store for this session; commit
  // changes back so each chat resumes its own panel size + open tab.
  const layout = useChatLayout(sessionId);
  const patchLayout = useUiStore((s) => s.patchLayout);

  // Multi-tab model: a list of open tabs + the active tab id. Seeded from the
  // per-chat layout; every mutation is committed back so it persists per chat.
  const [openTabs, setOpenTabs] = useState<OpenTab[]>(
    layout.openTabs ?? [],
  );
  const [activeTabId, setActiveTabId] = useState<string | null>(
    layout.activeTabId ?? null,
  );
  const [width, setWidth] = useState<number>(layout.rightWidth ?? DEFAULT_WIDTH);
  const widthRef = useRef<number>(layout.rightWidth ?? DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const [fullWidth, setFullWidth] = useState(false);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  // Re-seed local width + tabs when the active chat changes (its saved layout).
  useEffect(() => {
    setWidth(layout.rightWidth ?? DEFAULT_WIDTH);
    setOpenTabs(layout.openTabs ?? []);
    setActiveTabId(layout.activeTabId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Persist a tab set + active id for this chat. Setters + the store write all
  // happen in the event handler (never inside a render or a setState updater),
  // which avoids React's "setState during render" warning.
  const commitTabs = useCallback(
    (tabs: OpenTab[], active: string | null) => {
      setOpenTabs(tabs);
      setActiveTabId(active);
      patchLayout(sessionId, { openTabs: tabs, activeTabId: active });
    },
    [patchLayout, sessionId],
  );

  // Open (or focus) a tab of the given kind. Unique kinds focus an existing tab;
  // browser/terminal always spawn a fresh instance.
  const openTab = useCallback(
    (kind: TabKind, opts?: { url?: string }) => {
      const existing = !MULTI_INSTANCE.has(kind)
        ? openTabs.find((t) => t.kind === kind)
        : undefined;
      if (existing) {
        commitTabs(openTabs, existing.id);
        return;
      }
      const tab: OpenTab = { id: newTabId(kind), kind, url: opts?.url };
      commitTabs([...openTabs, tab], tab.id);
    },
    [openTabs, commitTabs],
  );

  // Focus an already-open tab.
  const focusTab = useCallback(
    (id: string) => commitTabs(openTabs, id),
    [openTabs, commitTabs],
  );

  // Close a tab. If it was active, fall back to the previous tab (or the empty
  // tab-list state when none remain).
  const closeTab = useCallback(
    (id: string) => {
      const idx = openTabs.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const next = openTabs.filter((t) => t.id !== id);
      let nextActive = activeTabId;
      if (activeTabId === id) {
        const fallback = next[idx - 1] ?? next[idx] ?? next[next.length - 1];
        nextActive = fallback?.id ?? null;
      }
      commitTabs(next, nextActive);
    },
    [openTabs, activeTabId, commitTabs],
  );

  // Update a browser tab's persisted url.
  const setTabUrl = useCallback(
    (id: string, url: string) => {
      const next = openTabs.map((t) => (t.id === id ? { ...t, url } : t));
      setOpenTabs(next);
      patchLayout(sessionId, { openTabs: next });
    },
    [openTabs, patchLayout, sessionId],
  );

  // Seed a tab from `defaultTab` when there are no persisted tabs yet.
  useEffect(() => {
    if (
      (layout.openTabs?.length ?? 0) === 0 &&
      defaultTab &&
      defaultTab !== "none" &&
      defaultTab !== "preview"
    ) {
      openTab(defaultTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a file is opened from the composer, open/focus the Preview tab (and
  // make sure the panel is open). Keyed on url so a re-opened file re-triggers.
  useEffect(() => {
    if (!previewFile) return;
    openTab("preview");
    if (!open) onOpenChange?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewFile?.url]);

  const activeTab = openTabs.find((t) => t.id === activeTabId) ?? null;

  const collapse = () => onOpenChange?.(false);
  const toggleFullWidth = () => {
    const next = !fullWidth;
    setFullWidth(next);
    onFullWidthChange?.(next);
  };

  const clamp = (w: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));

  const onPointerMove = useCallback((e: PointerEvent) => {
    const s = dragState.current;
    if (!s) return;
    // Handle is on the LEFT edge: dragging left (negative dx) widens the panel.
    const dx = e.clientX - s.startX;
    const w = clamp(s.startWidth - dx);
    widthRef.current = w; // latest width, read on pointer-up to persist
    setWidth(w);
  }, []);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
    setDragging(false);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    // Commit the final width to the store (per-chat, persisted) — read from the
    // ref so we don't call the store setter inside a setState updater.
    patchLayout(sessionId, { rightWidth: widthRef.current });
  }, [onPointerMove, patchLayout, sessionId]);

  const onHandleDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragState.current = { startX: e.clientX, startWidth: width };
      setDragging(true);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [width, onPointerMove, onPointerUp],
  );

  // Collapse (open→false) animates the panel's width to 0 so it slides out.
  // Full-width expand animates flex-grow 0→1 (paired with the shell's chat
  // column animating its grow 1→0), so the panel smoothly grows to fill.
  // - collapsed:   width 0            (flex-basis irrelevant, box is 0)
  // - full-width:  flex-basis width, grow 1  → grows to fill remaining space
  // - normal:      flex-basis width, grow 0  → fixed, resizable width
  //
  // Both `width` (collapse) and `flex-grow` (expand) are transitioned, except
  // while dragging the resize handle (where the width must track the pointer).
  return (
    <aside
      aria-hidden={!open}
      className={cx(
        // Same flat background as the chat area + left sidebar (--app-bg), only
        // separated by the left border hairline.
        "relative flex h-full flex-col overflow-hidden border-l bg-app-bg",
        // The border collapses with the panel so a hairline doesn't linger.
        open ? "border-panel-border" : "border-transparent",
        // Transition flex-basis (the collapse/expand width driver) + flex-grow
        // (the full-width expand). NOT `width`, which stays unset so flex-basis
        // alone governs the size. Skipped while dragging the resize handle.
        !dragging &&
          "transition-[flex-basis,flex-grow] duration-300 ease-[var(--ease-out-quart)]",
      )}
      style={{
        // `flex` shorthand only (no Tailwind flex-* longhand) so React never
        // warns about mixing shorthand/longhand. flex-basis is the animated
        // width:
        //   collapsed  → basis 0            → slides shut
        //   full-width → basis width, grow 1 → grows to fill remaining space
        //   normal     → basis width, grow 0 → fixed, resizable width
        flex: !open ? "0 0 0px" : fullWidth ? `1 0 ${width}px` : `0 0 ${width}px`,
        // Fully out of the tab order + un-clickable when collapsed.
        pointerEvents: open ? undefined : "none",
      }}
    >
      {/* Inner wrapper. When at a fixed width it is pinned to that width so the
          collapse slide doesn't squish its contents; in full-width it fills the
          growing panel (its inner content caps its own width — see tab pills). */}
      <div
        className="flex h-full min-w-0 flex-col overflow-hidden"
        style={{ width: fullWidth ? "100%" : width, minWidth: fullWidth ? 0 : width }}
      >
      {/* Left-edge resize handle */}
      <button
        type="button"
        aria-label="Resize panel"
        onPointerDown={onHandleDown}
        tabIndex={open ? 0 : -1}
        className={cx(
          "group absolute inset-y-0 left-0 z-10 flex w-2 cursor-col-resize touch-none items-center justify-center",
          "focus:outline-none",
        )}
      >
        <span
          className={cx(
            "h-full w-px transition-colors duration-150 ease-out",
            dragging
              ? "bg-[var(--primary)]"
              : "bg-transparent group-hover:bg-[var(--primary)]",
          )}
        />
      </button>

      {openTabs.length === 0 ? (
        <TabListEmptyState
          onOpen={(id) => openTab(id)}
          onCollapse={collapse}
          bottomPanelOpen={bottomPanelOpen}
          onToggleBottom={onToggleBottomPanel}
          onExpandFull={toggleFullWidth}
        />
      ) : (
        <>
          <PanelHeader
            tabs={openTabs}
            activeTabId={activeTabId}
            previewName={previewFile?.name}
            onSelectTab={focusTab}
            onCloseTab={closeTab}
            onOpenKind={(id) => openTab(id)}
            onCollapse={collapse}
            bottomPanelOpen={bottomPanelOpen}
            onToggleBottom={onToggleBottomPanel}
            onExpandFull={toggleFullWidth}
          />
          <div className="relative min-h-0 flex-1">
            {openTabs.map((t) => {
              const isActive = t.id === activeTabId;
              return (
                <div
                  key={t.id}
                  // Keep every open tab mounted (so terminals/browsers keep their
                  // sockets + page state); only the active one is visible.
                  className={cx(
                    "absolute inset-0 min-h-0",
                    t.kind === "terminal" || t.kind === "browser"
                      ? "overflow-hidden"
                      : "overflow-y-auto",
                    isActive ? "block" : "hidden",
                  )}
                >
                  {t.kind === "review" ? (
                    <ReviewTab cwd={cwd} active={isActive} fallback={diffFiles} />
                  ) : t.kind === "terminal" ? (
                    <TerminalView cwd={cwd} />
                  ) : t.kind === "browser" ? (
                    <BrowserTab
                      url={t.url}
                      onUrlChange={(url) => setTabUrl(t.id, url)}
                    />
                  ) : t.kind === "files" ? (
                    <FilesTab cwd={cwd} active={isActive} />
                  ) : t.kind === "preview" ? (
                    <PreviewTab file={previewFile} />
                  ) : (
                    <PlaceholderTab
                      Icon={SideChatTabIcon}
                      title="Start a side chat"
                      hint="Ask a question without disrupting the main thread."
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      </div>
    </aside>
  );
}

/**
 * Empty state (matches the reference): header controls at the top, then the tab
 * rows as rounded pills — icon + label + keyboard shortcut — vertically centered
 * in the panel.
 */
function TabListEmptyState({
  onOpen,
  onCollapse,
  bottomPanelOpen,
  onToggleBottom,
  onExpandFull,
}: {
  onOpen: (id: PickerKind) => void;
  onCollapse: () => void;
  bottomPanelOpen?: boolean;
  onToggleBottom?: () => void;
  onExpandFull: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Header controls */}
      <div className="flex h-11 shrink-0 items-center justify-end gap-0.5 px-2">
        <Tooltip label="Expand to full width" side="bottom">
          <HeaderIconButton label="Expand to full width" onClick={onExpandFull}>
            <ExpandFullIcon width={18} height={18} />
          </HeaderIconButton>
        </Tooltip>
        <BottomPanelToggle open={bottomPanelOpen} onToggle={onToggleBottom} />
        <Tooltip label="Collapse panel" side="bottom">
          <HeaderIconButton label="Collapse panel" onClick={onCollapse}>
            <PanelRightOpenIcon width={18} height={18} />
          </HeaderIconButton>
        </Tooltip>
      </div>

      {/* Tab pills, vertically + horizontally centered. Capped at a max width so
          they don't stretch edge-to-edge when the panel is expanded wide. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-3">
        <div className="flex w-full max-w-[420px] flex-col gap-1.5">
          {TABS.map(({ id, label, shortcut, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onOpen(id)}
              className="flex h-11 w-full items-center gap-3 rounded-[12px] border border-panel-border bg-bubble-bg px-3 text-left transition-[background-color] duration-150 ease-out hover:bg-nav-active-bg"
            >
              <Icon
                width={18}
                height={18}
                className="size-[18px] shrink-0 icon-muted"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium leading-5 text-text-strong">
                {label}
              </span>
              <span className="shrink-0 font-mono text-[12px] leading-4 text-text-faint tabular-nums">
                {shortcut}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * h-11 header: a horizontal strip of tab chips (icon + short label + close),
 * the active one highlighted, plus a "+" button that opens the same tab-list
 * picker the empty state shows. On the right: expand-full / bottom-panel toggle
 * / collapse.
 */
function PanelHeader({
  tabs,
  activeTabId,
  previewName,
  onSelectTab,
  onCloseTab,
  onOpenKind,
  onCollapse,
  bottomPanelOpen,
  onToggleBottom,
  onExpandFull,
}: {
  tabs: OpenTab[];
  activeTabId: string | null;
  /** Name shown on the preview chip, if a preview tab is open. */
  previewName?: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onOpenKind: (kind: PickerKind) => void;
  onCollapse: () => void;
  bottomPanelOpen?: boolean;
  onToggleBottom?: () => void;
  onExpandFull: () => void;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-panel-border px-2">
      {/* Tab strip */}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const { label, Icon } = tabMeta(t.kind);
          const chipLabel = t.kind === "preview" ? (previewName ?? label) : label;
          const isActive = t.id === activeTabId;
          return (
            <div
              key={t.id}
              className={cx(
                "group flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] pl-2.5 pr-1.5 transition-colors duration-150 ease-out",
                isActive
                  ? "bg-bubble-bg"
                  : "hover:bg-bubble-bg/60",
              )}
            >
              <button
                type="button"
                onClick={() => onSelectTab(t.id)}
                className="flex min-w-0 items-center gap-2"
              >
                <Icon
                  width={16}
                  height={16}
                  className={cx(
                    "shrink-0",
                    isActive ? "icon-muted" : "icon-faint",
                  )}
                />
                <span
                  className={cx(
                    "max-w-[120px] truncate text-[13px] font-medium leading-5",
                    isActive ? "text-text-strong" : "text-text-secondary",
                  )}
                >
                  {chipLabel}
                </span>
              </button>
              <button
                type="button"
                aria-label="Close tab"
                onClick={() => onCloseTab(t.id)}
                className="flex size-5 items-center justify-center rounded-full text-text-secondary opacity-60 transition-[opacity,background-color,color] duration-150 ease-out hover:bg-nav-active-bg hover:text-text-strong hover:opacity-100 group-hover:opacity-100"
              >
                <XIcon width={14} height={14} />
              </button>
            </div>
          );
        })}
        {/* Add tab — opens the picker menu */}
        <AddTabMenu onOpenKind={onOpenKind} />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <Tooltip label="Expand to full width" side="bottom">
          <HeaderIconButton label="Expand to full width" onClick={onExpandFull}>
            <ExpandFullIcon width={18} height={18} />
          </HeaderIconButton>
        </Tooltip>
        <BottomPanelToggle open={bottomPanelOpen} onToggle={onToggleBottom} />
        <Tooltip label="Collapse panel" side="bottom">
          <HeaderIconButton label="Collapse panel" onClick={onCollapse}>
            <PanelRightOpenIcon width={18} height={18} />
          </HeaderIconButton>
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * The "+" add-tab control. Opens a menu with the SAME picker options the empty
 * state lists (Review / Terminal / Browser / Files / Side chat). Selecting one
 * opens (or focuses) a tab of that kind.
 */
function AddTabMenu({
  onOpenKind,
}: {
  onOpenKind: (kind: PickerKind) => void;
}) {
  return (
    <Menu
      side="bottom"
      align="start"
      trigger={
        <HeaderIconButton label="New tab">
          <AddTabIcon width={18} height={18} />
        </HeaderIconButton>
      }
    >
      {TABS.map(({ id, label, shortcut, Icon }) => (
        <MenuItem
          key={id}
          icon={<Icon width={16} height={16} />}
          label={label}
          description={shortcut}
          onSelect={() => onOpenKind(id)}
        />
      ))}
    </Menu>
  );
}

/**
 * The bottom-panel toggle header button. Shows the OPEN glyph (filled bar) when
 * the bottom panel is showing, the CLOSED glyph (outline + line) otherwise, so
 * its state is legible at a glance. Shared by both panel header variants.
 */
function BottomPanelToggle({
  open,
  onToggle,
}: {
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <Tooltip label="Toggle bottom panel" shortcut="⌘J" side="bottom">
      <HeaderIconButton label="Toggle bottom panel" onClick={onToggle}>
        {open ? (
          <BottomPanelOpenIcon width={18} height={18} />
        ) : (
          <BottomPanelClosedIcon width={18} height={18} />
        )}
      </HeaderIconButton>
    </Tooltip>
  );
}

/**
 * Header icon button. Forwards its ref AND spreads incoming props onto the real
 * <button>, so when it's used as a Base UI Tooltip/Menu trigger (`render=`) the
 * hover/focus/aria handlers actually attach — without that, the tooltip never
 * shows. `size-6` + `shrink-0` keep the hit area fixed; the icon is wrapped in a
 * `shrink-0` box so the glyph never compresses when the row tightens.
 */
const HeaderIconButton = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    onClick?: () => void;
    children: React.ReactNode;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function HeaderIconButton({ label, onClick, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      onClick={onClick}
      {...rest}
      className="flex size-6 shrink-0 items-center justify-center rounded-[8.4px] border-[0.556px] border-transparent icon-muted transition-[opacity,background-color] duration-150 ease-out hover:bg-bubble-bg hover:opacity-100 data-[popup-open]:bg-bubble-bg data-[popup-open]:opacity-100"
    >
      <span className="flex size-[18px] shrink-0 items-center justify-center [&>svg]:shrink-0">
        {children}
      </span>
    </button>
  );
});

/** Repo name shown in the toolbar, derived from the cwd's last path segment. */
function repoNameFromCwd(cwd?: string): string {
  if (!cwd) return "app";
  return cwd.split("/").filter(Boolean).pop() || "app";
}

/**
 * Review tab: toolbar with repo/branch + totals, and a scrollable list of the
 * changed files from `git status`. Staged + unstaged files are shown; clicking a
 * row loads its diff (`git diff`) inline. Data is fetched on demand when the tab
 * is active and `cwd` is set. With no cwd it falls back to the mock so the
 * standalone story still renders.
 */
function ReviewTab({
  cwd,
  active,
  fallback,
}: {
  cwd?: string;
  active: boolean;
  fallback: DiffFile[];
}) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The currently-expanded file's diff (path → keyed so switching re-fetches).
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(() => {
    if (!cwd) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .gitStatus(cwd)
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setStatus(null);
          setError(e instanceof Error ? e.message : "Failed to load git status");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  // Fetch when the tab becomes active, cwd changes, or a manual refresh fires.
  useEffect(() => {
    if (!active || !cwd) return;
    const cleanup = load();
    return cleanup;
  }, [active, cwd, nonce, load]);

  // Reset the open diff when switching directories.
  useEffect(() => {
    setOpenFile(null);
  }, [cwd]);

  // Build the display list from real data (staged first, then unstaged) when a
  // cwd is present; otherwise fall back to the mock diff.
  const gitFiles: (GitFile & { staged: boolean })[] = status
    ? [
        ...status.staged.map((f) => ({ ...f, staged: true })),
        ...status.unstaged.map((f) => ({ ...f, staged: false })),
      ]
    : [];
  const usingReal = !!cwd;
  const files: DiffFile[] = usingReal
    ? gitFiles.map((f) => ({ path: f.path, added: f.added, removed: f.removed, kind: f.status }))
    : fallback;

  const totalAdded = files.reduce((s, f) => s + f.added, 0);
  const totalRemoved = files.reduce((s, f) => s + f.removed, 0);

  const repo = repoNameFromCwd(cwd);
  const empty = usingReal && !loading && !error && files.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar: repo + branch selectors, totals, and view controls. */}
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <button
          type="button"
          className="flex items-center gap-1 text-[13px] font-medium leading-5 text-text-strong transition-colors duration-150 ease-out hover:text-text-primary"
        >
          {repo}
          <ChevronDownIcon width={14} height={14} className="icon-muted" />
        </button>
        <button
          type="button"
          className="flex items-center gap-1 truncate text-[13px] leading-5 text-text-secondary transition-colors duration-150 ease-out hover:text-text-strong"
        >
          {status?.branch ?? "Unstaged"}
          <ChevronDownIcon width={14} height={14} />
        </button>
        <span className="flex items-center gap-1.5 font-mono text-[12px] leading-4 tabular-nums">
          <span className="text-[color:var(--diff-add,#16a34a)]">
            +{totalAdded}
          </span>
          <span className="text-[color:var(--diff-remove,#dc2626)]">
            -{totalRemoved}
          </span>
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          {usingReal ? (
            <HeaderIconButton
              label="Refresh"
              onClick={() => setNonce((n) => n + 1)}
            >
              <RefreshIcon width={16} height={16} />
            </HeaderIconButton>
          ) : null}
          <HeaderIconButton label="More">
            <DotsIcon width={16} height={16} />
          </HeaderIconButton>
          <HeaderIconButton label="Sort">
            <SortIcon width={16} height={16} />
          </HeaderIconButton>
        </div>
      </div>

      {/* File list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {loading && files.length === 0 ? (
          <p className="px-2 py-3 text-[12px] leading-4 text-text-faint">
            Loading changes…
          </p>
        ) : error ? (
          <p className="px-2 py-3 text-[12px] leading-4 text-text-faint">
            Couldn&apos;t load changes.
          </p>
        ) : empty ? (
          <p className="px-2 py-3 text-[12px] leading-4 text-text-faint">
            No changes
          </p>
        ) : (
          files.map((f) => (
            <DiffRow
              key={f.path}
              file={f}
              cwd={usingReal ? cwd : undefined}
              open={openFile === f.path}
              onToggle={() =>
                setOpenFile((cur) => (cur === f.path ? null : f.path))
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function DiffRow({
  file,
  cwd,
  open,
  onToggle,
}: {
  file: DiffFile;
  /** When set, clicking loads the file's diff via the git-diff endpoint. */
  cwd?: string;
  open?: boolean;
  onToggle?: () => void;
}) {
  const name = file.path.split("/").pop() ?? file.path;
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Lazily fetch the diff the first time this row is expanded (and re-fetch if
  // the file/cwd changes while open).
  useEffect(() => {
    if (!open || !cwd) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setDiff(null);
    api
      .gitDiff(cwd, file.path)
      .then((r) => {
        if (!cancelled) setDiff(r.diff);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, cwd, file.path]);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cx(
          "flex h-8 w-full items-center gap-2 rounded-[8.4px] px-2 text-left transition-colors duration-150 ease-out hover:bg-bubble-bg",
          open && "bg-bubble-bg",
        )}
      >
        <FileIcon width={16} height={16} className="shrink-0 icon-faint" />
        <span className="min-w-0 flex-1 truncate text-sm leading-5 text-text-primary">
          {name}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[12px] leading-4 tabular-nums">
          {file.added > 0 ? (
            <span className="text-[color:var(--diff-add,#16a34a)]">
              +{file.added}
            </span>
          ) : null}
          {file.removed > 0 ? (
            <span className="text-[color:var(--diff-remove,#dc2626)]">
              -{file.removed}
            </span>
          ) : null}
        </span>
      </button>
      {open && cwd ? (
        <div className="px-2 pb-1">
          {loading ? (
            <p className="py-2 text-[12px] leading-4 text-text-faint">
              Loading diff…
            </p>
          ) : error ? (
            <p className="py-2 text-[12px] leading-4 text-text-faint">
              Couldn&apos;t load diff.
            </p>
          ) : diff ? (
            <DiffView diff={diff} />
          ) : (
            <p className="py-2 text-[12px] leading-4 text-text-faint">
              No diff to show.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Minimal +/- diff renderer. Colors added/removed lines and dims hunk headers /
 * file metadata. Kept simple and unable to throw — it just styles each line.
 */
function DiffView({ diff }: { diff: string }) {
  const lines = diff.replace(/\n$/, "").split("\n");
  return (
    <pre className="overflow-x-auto rounded-[8.4px] border border-card-border bg-code-bg px-3 py-2 font-mono text-[12px] leading-5">
      <code>
        {lines.map((line, i) => {
          const isMeta =
            line.startsWith("diff ") ||
            line.startsWith("index ") ||
            line.startsWith("--- ") ||
            line.startsWith("+++ ") ||
            line.startsWith("new file") ||
            line.startsWith("deleted file") ||
            line.startsWith("similarity ") ||
            line.startsWith("rename ");
          const isHunk = line.startsWith("@@");
          const isAdd = !isMeta && line.startsWith("+");
          const isRemove = !isMeta && line.startsWith("-");
          return (
            <div
              key={i}
              className={cx(
                "whitespace-pre",
                isHunk && "text-text-secondary",
                isMeta && "text-text-faint",
                isAdd && "text-[color:var(--diff-add,#16a34a)]",
                isRemove && "text-[color:var(--diff-remove,#dc2626)]",
                !isHunk && !isMeta && !isAdd && !isRemove && "text-code-text",
              )}
            >
              {line || " "}
            </div>
          );
        })}
      </code>
    </pre>
  );
}

/**
 * Files tab: a lazily-expandable file tree. The root level is loaded when the
 * tab activates; expanding a directory fetches its children (one level per
 * call). Directories are listed before files. Clicking a file previews its
 * content (respecting the server's `truncated` flag). With no cwd, an empty
 * state is shown.
 */
function FilesTab({ cwd, active }: { cwd?: string; active: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);

  // Reset the preview when switching directories.
  useEffect(() => {
    setSelected(null);
  }, [cwd]);

  if (!cwd) {
    return (
      <PlaceholderTab
        Icon={FilesTabIcon}
        title="No files"
        hint="Open a session to browse its files."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        <FileTreeLevel
          cwd={cwd}
          path=""
          depth={0}
          active={active}
          selected={selected}
          onSelectFile={setSelected}
        />
      </div>
      {selected ? (
        <div className="min-h-0 max-h-[45%] shrink-0 overflow-y-auto border-t border-panel-border">
          <FilePreview cwd={cwd} path={selected} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * One directory level of the file tree. Fetches its entries via `api.files`.
 * The root level (path === "") auto-loads; nested levels are only rendered when
 * their parent row is expanded, so they load lazily on first expand.
 */
function FileTreeLevel({
  cwd,
  path,
  depth,
  active,
  selected,
  onSelectFile,
}: {
  cwd: string;
  path: string;
  depth: number;
  active: boolean;
  selected: string | null;
  onSelectFile: (path: string) => void;
}) {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .files(cwd, path)
      .then((list) => {
        if (cancelled) return;
        // Dirs first, then files, each alphabetical.
        const sorted = [...list].sort((a, b) => {
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setEntries(sorted);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, path, active]);

  if (loading && !entries) {
    return (
      <p
        className="py-1 text-[12px] leading-4 text-text-faint"
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        Loading…
      </p>
    );
  }
  if (error) {
    return (
      <p
        className="py-1 text-[12px] leading-4 text-text-faint"
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        Couldn&apos;t load.
      </p>
    );
  }
  if (entries && entries.length === 0) {
    return (
      <p
        className="py-1 text-[12px] leading-4 text-text-faint"
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        Empty
      </p>
    );
  }

  return (
    <div>
      {entries?.map((entry) => (
        <FileTreeNode
          key={entry.path}
          cwd={cwd}
          entry={entry}
          depth={depth}
          selected={selected}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  );
}

function FileTreeNode({
  cwd,
  entry,
  depth,
  selected,
  onSelectFile,
}: {
  cwd: string;
  entry: FileEntry;
  depth: number;
  selected: string | null;
  onSelectFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isDir = entry.type === "dir";
  const isSelected = !isDir && selected === entry.path;
  const pad = 8 + depth * 14;

  return (
    <div>
      <button
        type="button"
        onClick={() => (isDir ? setExpanded((v) => !v) : onSelectFile(entry.path))}
        aria-expanded={isDir ? expanded : undefined}
        className={cx(
          "flex h-8 w-full items-center gap-1.5 rounded-[8.4px] pr-2 text-left transition-colors duration-150 ease-out hover:bg-bubble-bg",
          isSelected && "bg-bubble-bg",
        )}
        style={{ paddingLeft: pad }}
      >
        {isDir ? (
          <ChevronRightIcon
            width={12}
            height={12}
            className={cx(
              "shrink-0 icon-faint transition-transform duration-150 ease-out",
              expanded && "rotate-90",
            )}
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isDir ? (
          expanded ? (
            <FolderOpenIcon width={16} height={16} className="shrink-0 icon-muted" />
          ) : (
            <FolderIcon width={16} height={16} className="shrink-0 icon-muted" />
          )
        ) : (
          <FileIcon width={16} height={16} className="shrink-0 icon-faint" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm leading-5 text-text-primary">
          {entry.name}
        </span>
      </button>
      {isDir && expanded ? (
        <FileTreeLevel
          cwd={cwd}
          path={entry.path}
          depth={depth + 1}
          active
          selected={selected}
          onSelectFile={onSelectFile}
        />
      ) : null}
    </div>
  );
}

/** Preview of a selected file's content — reuses CodeBlock. */
function FilePreview({ cwd, path }: { cwd: string; path: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setContent(null);
    api
      .fileContent(cwd, path)
      .then((r) => {
        if (cancelled) return;
        setContent(r.content);
        setTruncated(r.truncated);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, path]);

  const name = path.split("/").pop() ?? path;
  const ext = name.includes(".") ? name.split(".").pop() : undefined;

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-1.5 pb-1">
        <FileIcon width={14} height={14} className="shrink-0 icon-faint" />
        <span className="min-w-0 flex-1 truncate text-[12px] leading-4 text-text-secondary">
          {path}
        </span>
      </div>
      {loading ? (
        <p className="py-2 text-[12px] leading-4 text-text-faint">Loading…</p>
      ) : error ? (
        <p className="py-2 text-[12px] leading-4 text-text-faint">
          Couldn&apos;t load file.
        </p>
      ) : content !== null ? (
        <>
          <CodeBlock code={content} lang={ext} />
          {truncated ? (
            <p className="pb-1 text-[12px] leading-4 text-text-faint">
              File truncated — showing the beginning only.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Simple centered empty state used by Terminal / Files / Side chat tabs. */
function PlaceholderTab({
  Icon,
  title,
  hint,
}: {
  Icon: (p: React.SVGProps<SVGSVGElement> & { size?: number }) => React.ReactElement;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6">
      <Icon width={24} height={24} className="icon-faint" />
      <p className="text-sm font-medium leading-5 text-text-secondary">{title}</p>
      <p className="text-center text-[12px] leading-4 text-text-faint">{hint}</p>
    </div>
  );
}

/**
 * Preview of an opened attachment. Images render inline, PDFs in an embedded
 * viewer, text files as decoded plaintext, and anything else falls back to a
 * card with a download link. The file arrives as a data: URL from the composer.
 */
function PreviewTab({ file }: { file: PreviewFile | null }) {
  const [text, setText] = useState<string | null>(null);

  const isImage = file?.mime.startsWith("image/");
  const isPdf =
    file?.mime === "application/pdf" || /\.pdf$/i.test(file?.name ?? "");
  const isText =
    !!file &&
    !isImage &&
    !isPdf &&
    (file.mime.startsWith("text/") ||
      /\.(txt|md|markdown|json|ya?ml|csv|log|tsx?|jsx?|css|html?|xml|sh)$/i.test(
        file.name,
      ));

  // Decode a text data: URL to a string for inline display.
  useEffect(() => {
    if (!file || !isText) {
      setText(null);
      return;
    }
    let cancelled = false;
    fetch(file.url)
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => {
        if (!cancelled) setText(null);
      });
    return () => {
      cancelled = true;
    };
  }, [file, isText]);

  if (!file) {
    return (
      <PlaceholderTab
        Icon={FileIcon}
        title="No preview"
        hint="Open a file to see it here."
      />
    );
  }

  if (isImage) {
    return (
      <div className="flex h-full items-center justify-center bg-black/20 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.url}
          alt={file.name}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      </div>
    );
  }

  if (isPdf) {
    return (
      <object
        data={file.url}
        type="application/pdf"
        className="h-full w-full"
        aria-label={file.name}
      >
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
          <FileIcon width={28} height={28} className="icon-faint" />
          <p className="text-center text-[12px] leading-4 text-text-faint">
            Can&apos;t display this PDF inline.
          </p>
          <a
            href={file.url}
            download={file.name}
            className="rounded-full bg-btn-solid-bg px-3.5 py-1.5 text-[13px] font-semibold text-btn-solid-text"
          >
            Download
          </a>
        </div>
      </object>
    );
  }

  if (isText) {
    return (
      <pre className="h-full overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12px] leading-5 text-text-primary">
        {text ?? "Loading…"}
      </pre>
    );
  }

  // Fallback: generic file card with a download link.
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
      <span className="flex size-12 items-center justify-center rounded-xl bg-[#d64545] text-white">
        <FileIcon width={24} height={24} />
      </span>
      <p className="text-center text-sm font-medium leading-5 text-text-strong">
        {file.name}
      </p>
      <a
        href={file.url}
        download={file.name}
        className="rounded-full bg-btn-solid-bg px-3.5 py-1.5 text-[13px] font-semibold text-btn-solid-text"
      >
        Download
      </a>
    </div>
  );
}
