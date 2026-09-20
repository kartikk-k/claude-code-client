"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
  ReviewIcon,
  TerminalTabIcon,
  FilesTabIcon,
  SideChatTabIcon,
  GlobeIcon,
  FileIcon,
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

/** The set of openable tabs. `'none'` renders the empty tab-list state.
 *  `'preview'` is dynamic — shown only when an attachment is opened. */
type TabId =
  | "none"
  | "review"
  | "terminal"
  | "browser"
  | "files"
  | "sidechat"
  | "preview";

/** A file opened for preview in the right panel (from a composer attachment). */
export type PreviewFile = { name: string; url: string; mime: string };

type TabDef = {
  id: Exclude<TabId, "none">;
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
}: RightPanelProps) {
  const [tab, setTab] = useState<TabId>(defaultTab);

  // When a file is opened from the composer, jump to the Preview tab (and make
  // sure the panel is open). Keyed on url so a new/re-opened file re-triggers.
  useEffect(() => {
    if (!previewFile) return;
    setTab("preview");
    if (!open) onOpenChange?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewFile?.url]);
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const [fullWidth, setFullWidth] = useState(false);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

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
    setWidth(clamp(s.startWidth - dx));
  }, []);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
    setDragging(false);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

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

  const activeTab = TABS.find((t) => t.id === tab);

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

      {tab === "none" ? (
        <TabListEmptyState
          onOpen={setTab}
          onCollapse={collapse}
          bottomPanelOpen={bottomPanelOpen}
          onToggleBottom={onToggleBottomPanel}
          onExpandFull={toggleFullWidth}
        />
      ) : (
        <>
          <PanelHeader
            label={
              tab === "preview"
                ? (previewFile?.name ?? "Preview")
                : (activeTab?.label ?? "")
            }
            Icon={tab === "preview" ? FileIcon : (activeTab?.Icon ?? ReviewIcon)}
            onClose={() => setTab("none")}
            onCollapse={collapse}
            bottomPanelOpen={bottomPanelOpen}
            onToggleBottom={onToggleBottomPanel}
            onExpandFull={toggleFullWidth}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "review" ? (
              <ReviewTab files={diffFiles} />
            ) : tab === "terminal" ? (
              <TerminalPane cwd={cwd} />
            ) : tab === "browser" ? (
              <PlaceholderTab
                Icon={GlobeIcon}
                title="Browser"
                hint="No page open."
              />
            ) : tab === "files" ? (
              <PlaceholderTab
                Icon={FilesTabIcon}
                title="No files"
                hint="Open a file to see it here."
              />
            ) : tab === "preview" ? (
              <PreviewTab file={previewFile} />
            ) : (
              <PlaceholderTab
                Icon={SideChatTabIcon}
                title="Start a side chat"
                hint="Ask a question without disrupting the main thread."
              />
            )}
          </div>
        </>
      )}
      </div>
    </aside>
  );
}

/**
 * Terminal placeholder — shows the working directory it would open in (the
 * active session's cwd). Wiring to a real PTY comes later; for now it renders
 * the prompt line so the layout and directory are visible.
 */
function TerminalPane({ cwd, compact }: { cwd?: string; compact?: boolean }) {
  const dir = cwd || "~";
  return (
    <div
      className={cx(
        "flex h-full min-h-0 flex-col overflow-y-auto bg-code-bg px-3 font-mono text-[12px] leading-5",
        compact ? "py-2" : "py-3",
      )}
    >
      <div className="text-text-secondary">
        <span className="text-[color:var(--agent-accent)]">➜</span>{" "}
        <span className="text-text-strong">{dir}</span>
      </div>
      <div className="mt-1 flex items-center text-text-strong">
        <span className="text-[color:var(--agent-accent)]">➜</span>
        <span className="ml-2 inline-block h-4 w-2 animate-pulse bg-text-faint" />
      </div>
    </div>
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
  onOpen: (id: TabId) => void;
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
 * h-11 header: the active tab rendered as a chip (icon + label + close) with a
 * "+" add-tab button, then a single sidebar control that collapses the panel.
 */
function PanelHeader({
  label,
  Icon,
  onClose,
  onCollapse,
  bottomPanelOpen,
  onToggleBottom,
  onExpandFull,
}: {
  label: string;
  Icon: (p: React.SVGProps<SVGSVGElement> & { size?: number }) => React.ReactElement;
  onClose: () => void;
  onCollapse: () => void;
  bottomPanelOpen?: boolean;
  onToggleBottom?: () => void;
  onExpandFull: () => void;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-panel-border px-2">
      {/* Active tab chip */}
      <div className="flex h-8 items-center gap-2 rounded-[10px] bg-bubble-bg px-2.5">
        <Icon width={16} height={16} className="shrink-0 icon-muted" />
        <span className="text-[13px] font-medium leading-5 text-text-strong">
          {label}
        </span>
        <button
          type="button"
          aria-label="Close tab"
          onClick={onClose}
          className="-mr-0.5 flex size-5 items-center justify-center rounded-full text-text-secondary transition-colors duration-150 ease-out hover:bg-nav-active-bg hover:text-text-strong"
        >
          <XIcon width={14} height={14} />
        </button>
      </div>
      {/* Add tab */}
      <Tooltip label="New tab" shortcut="⌘T" side="bottom">
        <HeaderIconButton label="New tab">
          <AddTabIcon width={18} height={18} />
        </HeaderIconButton>
      </Tooltip>

      <div className="ml-auto flex items-center gap-0.5">
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

/** Review tab: toolbar with totals + scrollable list of changed files. */
function ReviewTab({ files }: { files: DiffFile[] }) {
  const totalAdded = files.reduce((s, f) => s + f.added, 0);
  const totalRemoved = files.reduce((s, f) => s + f.removed, 0);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar: repo + staged selectors, totals, and view controls. */}
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <button
          type="button"
          className="flex items-center gap-1 text-[13px] font-medium leading-5 text-text-strong transition-colors duration-150 ease-out hover:text-text-primary"
        >
          app
          <ChevronDownIcon width={14} height={14} className="icon-muted" />
        </button>
        <button
          type="button"
          className="flex items-center gap-1 text-[13px] leading-5 text-text-secondary transition-colors duration-150 ease-out hover:text-text-strong"
        >
          Unstaged
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
        {files.map((f) => (
          <DiffRow key={f.path} file={f} />
        ))}
      </div>
    </div>
  );
}

function DiffRow({ file }: { file: DiffFile }) {
  const name = file.path.split("/").pop() ?? file.path;
  return (
    <button
      type="button"
      className="flex h-8 w-full items-center gap-2 rounded-[8.4px] px-2 text-left transition-colors duration-150 ease-out hover:bg-bubble-bg"
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
