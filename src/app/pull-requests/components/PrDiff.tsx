"use client";

/**
 * PrDiff — the "Code" view of the Pull requests page: a file-by-file diff
 * viewer for one pull request. This is what a reviewer actually opens the PR to
 * read.
 *
 * A toolbar carries the changed-file count + rolled-up +/- totals, a
 * filter-by-path input, an Expand all / Collapse all toggle, and a "viewed"
 * progress hint. Below it, each changed file is a collapsible card: a header row
 * (chevron, file icon, path, status badge, per-file +/- counts, and a real
 * "Viewed" checkbox wired to `state`), and — when expanded and not yet viewed —
 * the hunks rendered with GitHub-style add/remove line coloring and a
 * two-column old/new line-number gutter parsed from each hunk's `@@` header.
 *
 * Presentational + local UI state only (filter text, expand-all, per-file
 * collapse). The "viewed" state is the single source of truth in `PrStateApi`;
 * viewed files auto-collapse, mirroring GitHub. Assumes the parent supplies the
 * scroll container.
 */

import { useMemo, useState } from "react";
import {
  FileIcon,
  ChevronRightIcon,
  CheckIcon,
  SearchIcon,
} from "../../chat/components/icons";
import type { PullRequest, DiffFile, DiffHunk } from "../data";
import type { PrStateApi } from "../usePrState";

const cx = (...parts: Array<string | false | undefined>) =>
  parts.filter(Boolean).join(" ");

/** Status badge chip config: letter + inline hex color per change kind. */
const STATUS_META: Record<
  DiffFile["status"],
  { letter: string; color: string; label: string }
> = {
  added: { letter: "A", color: "#3fb950", label: "Added" },
  modified: { letter: "M", color: "#d29922", label: "Modified" },
  deleted: { letter: "D", color: "#f85149", label: "Deleted" },
  renamed: { letter: "R", color: "#539bf5", label: "Renamed" },
};

/** Split a path into its directory prefix and basename for two-tone rendering. */
function splitPath(path: string): { dir: string; base: string } {
  const i = path.lastIndexOf("/");
  if (i < 0) return { dir: "", base: path };
  return { dir: path.slice(0, i + 1), base: path.slice(i + 1) };
}

/**
 * Parse the starting old/new line numbers out of a hunk header of the form
 * `@@ -a,b +c,d @@ …`. Returns `{ oldStart, newStart }` (1-based), falling back
 * to 1/1 when the header can't be parsed.
 */
function parseHunkStart(header: string): { oldStart: number; newStart: number } {
  const m = /@@\s*-(\d+)(?:,\d+)?\s*\+(\d+)(?:,\d+)?\s*@@/.exec(header);
  return {
    oldStart: m ? parseInt(m[1], 10) : 1,
    newStart: m ? parseInt(m[2], 10) : 1,
  };
}

export function PrDiff({
  pr,
  state,
}: {
  pr: PullRequest;
  state: PrStateApi;
}) {
  const [filter, setFilter] = useState("");
  // Expand-all toggle (default expanded); also seeds new per-file collapse state.
  const [allExpanded, setAllExpanded] = useState(true);
  // Per-file collapse overrides keyed by path; undefined ⇒ follow `allExpanded`.
  const [collapsedOverride, setCollapsedOverride] = useState<
    Record<string, boolean>
  >({});

  const { sumAdd, sumDel } = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const f of pr.diff) {
      add += f.additions;
      del += f.deletions;
    }
    return { sumAdd: add, sumDel: del };
  }, [pr.diff]);

  const q = filter.trim().toLowerCase();
  const files = useMemo(
    () =>
      q
        ? pr.diff.filter((f) => f.path.toLowerCase().includes(q))
        : pr.diff,
    [pr.diff, q],
  );

  const isOpen = (path: string) =>
    collapsedOverride[path] ?? allExpanded;

  const toggleFile = (path: string) =>
    setCollapsedOverride((cur) => ({
      ...cur,
      [path]: !(cur[path] ?? allExpanded),
    }));

  const setAll = (expanded: boolean) => {
    setAllExpanded(expanded);
    // Clear per-file overrides so every card snaps to the new global state.
    setCollapsedOverride({});
  };

  const viewed = state.viewedCount(pr.id);

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex h-10 shrink-0 items-center gap-3 border-b border-panel-border bg-app-bg px-4">
        <div className="flex items-center gap-2 text-[13px] whitespace-nowrap">
          <span className="text-text-secondary">
            {pr.filesChanged} files changed
          </span>
          <span className="font-mono text-[12px] text-[color:var(--diff-add,#16a34a)]">
            +{sumAdd}
          </span>
          <span className="font-mono text-[12px] text-[color:var(--diff-remove,#dc2626)]">
            -{sumDel}
          </span>
        </div>

        {/* File filter */}
        <label className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[8px] border border-card-border bg-row-bg px-2">
          <SearchIcon className="size-3.5 shrink-0 text-icon-muted" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter files"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary placeholder:text-text-faint focus:outline-none"
          />
        </label>

        <span className="text-[12px] whitespace-nowrap text-text-faint">
          {viewed}/{pr.filesChanged} viewed
        </span>

        <button
          type="button"
          onClick={() => setAll(!allExpanded)}
          className="text-[13px] whitespace-nowrap text-text-secondary hover:text-text-strong"
        >
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {/* File list */}
      {pr.diff.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-16 text-[13px] text-text-faint">
          No file changes
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-16 text-[13px] text-text-faint">
          No files match &ldquo;{filter}&rdquo;
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          {files.map((file) => (
            <FileCard
              key={file.path}
              file={file}
              open={isOpen(file.path)}
              viewed={state.isFileViewed(pr.id, file.path)}
              onToggleOpen={() => toggleFile(file.path)}
              onToggleViewed={() =>
                state.toggleFileViewed(pr.id, file.path)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A single collapsible file card: header row + (when expanded) the hunks. */
function FileCard({
  file,
  open,
  viewed,
  onToggleOpen,
  onToggleViewed,
}: {
  file: DiffFile;
  open: boolean;
  viewed: boolean;
  onToggleOpen: () => void;
  onToggleViewed: () => void;
}) {
  const { dir, base } = splitPath(file.path);
  const badge = STATUS_META[file.status];
  // Viewed files auto-collapse their body (a real GitHub behavior).
  const bodyOpen = open && !viewed;

  return (
    <div
      className={cx(
        "overflow-hidden rounded-[12px] border border-card-border",
        viewed && "opacity-60",
      )}
    >
      {/* Header row (toggles collapse) */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleOpen();
          }
        }}
        className="flex h-10 cursor-pointer items-center gap-2 bg-code-header-bg px-3"
      >
        <ChevronRightIcon
          className={cx(
            "size-3.5 shrink-0 text-icon-muted transition-transform",
            bodyOpen && "rotate-90",
          )}
        />
        <FileIcon className="size-4 shrink-0 text-icon-faint" />

        <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
          {dir ? <span className="text-text-faint">{dir}</span> : null}
          <span className="text-text-primary">{base}</span>
        </span>

        <span
          className="shrink-0 rounded px-1 text-[10px] font-semibold"
          style={{ color: badge.color, backgroundColor: `${badge.color}22` }}
          title={badge.label}
        >
          {badge.letter}
        </span>

        <span className="shrink-0 font-mono text-[12px] text-[color:var(--diff-add,#16a34a)]">
          +{file.additions}
        </span>
        <span className="shrink-0 font-mono text-[12px] text-[color:var(--diff-remove,#dc2626)]">
          -{file.deletions}
        </span>

        {/* Viewed checkbox — must not toggle the collapse. */}
        <label
          className="ml-1 flex shrink-0 cursor-pointer items-center gap-1.5 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={viewed}
            onChange={onToggleViewed}
            className="sr-only"
          />
          <span
            className={cx(
              "flex size-4 items-center justify-center rounded border",
              viewed
                ? "border-[#3fb950] bg-[#3fb950]"
                : "border-card-border bg-app-bg",
            )}
          >
            {viewed ? (
              <CheckIcon className="size-3 text-app-bg" />
            ) : null}
          </span>
          <span className="text-[12px] text-text-secondary">Viewed</span>
        </label>
      </div>

      {/* Diff body */}
      {bodyOpen ? (
        <div className="border-t border-card-border">
          {file.hunks.length === 0 ? (
            <div className="bg-code-bg px-3 py-2 font-mono text-[12px] text-text-faint">
              No inline diff (binary or collapsed).
            </div>
          ) : (
            file.hunks.map((hunk, i) => <Hunk key={i} hunk={hunk} />)
          )}
        </div>
      ) : null}
    </div>
  );
}

/** One hunk: its `@@` header line, then each diff line with a 2-column gutter. */
function Hunk({ hunk }: { hunk: DiffHunk }) {
  const rows = useMemo(() => {
    const { oldStart, newStart } = parseHunkStart(hunk.header);
    let oldNo = oldStart;
    let newNo = newStart;
    return hunk.lines.map((line) => {
      const marker = line[0];
      const isAdd = marker === "+";
      const isRemove = marker === "-";
      const oldLabel = isAdd ? "" : String(oldNo++);
      const newLabel = isRemove ? "" : String(newNo++);
      return { line, isAdd, isRemove, oldLabel, newLabel };
    });
  }, [hunk]);

  return (
    <div>
      {/* Hunk header */}
      <div className="bg-code-bg px-3 py-1 font-mono text-[12px] text-text-secondary">
        {hunk.header}
      </div>

      {/* Lines (horizontally scrollable so long lines never break layout) */}
      <div className="overflow-x-auto">
        <div className="min-w-full font-mono text-[12px] leading-5">
          {rows.map((row, i) => (
            <div
              key={i}
              className={cx(
                "flex whitespace-pre",
                row.isAdd &&
                  "bg-[color:var(--diff-add,#16a34a)]/10 text-[color:var(--diff-add,#16a34a)]",
                row.isRemove &&
                  "bg-[color:var(--diff-remove,#dc2626)]/10 text-[color:var(--diff-remove,#dc2626)]",
                !row.isAdd && !row.isRemove && "text-code-text",
              )}
            >
              <span className="sticky left-0 w-10 shrink-0 select-none bg-app-bg px-1 text-right text-text-faint">
                {row.oldLabel}
              </span>
              <span className="w-10 shrink-0 select-none bg-app-bg px-1 text-right text-text-faint">
                {row.newLabel}
              </span>
              <span className="flex-1 px-2">{row.line || " "}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
