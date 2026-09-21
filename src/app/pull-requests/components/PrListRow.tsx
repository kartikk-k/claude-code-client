"use client";

/**
 * PrListRow — a single clickable row in the Pull requests list (the middle
 * column of the triage view). It stays one button (calls `onSelect(pr.id)`)
 * but renders GitHub-density content:
 *
 *  - Left glyph: an open PR glyph (with a red status dot overlaid when CI is
 *    failing), a purple merge glyph when the PR is merged, or a muted glyph
 *    when it is a draft.
 *  - Title line: the (truncated) title with a faint `#<number>` appended.
 *  - Metadata line: repo · branch plus small inline facts where space allows —
 *    comment count, files-changed count, and a mergeability hint chip
 *    ("conflicts" in red, "behind" in amber).
 *  - Right block: a compact stacked reviewer-avatar cluster (up to 3, with an
 *    initials fallback when the GitHub avatar 404s) over the relative "updated"
 *    label and the +/- diff counts.
 *
 * The row highlights when it is the selected PR (`active`), and hovers to a
 * softer version of the same highlight otherwise. Purely presentational: it is
 * driven by a `PullRequest` prop plus `active`/`onSelect`, no data fetching.
 */

import { useState } from "react";
import {
  CodePullRequestIcon,
  CodeMergeIcon,
} from "../../chat/components/icons";
import { avatarUrl, type PullRequest, type PrReviewer } from "../data";

/** Join conditional class parts (falsey entries dropped). */
const cx = (...parts: Array<string | false | undefined>) =>
  parts.filter(Boolean).join(" ");

export type PrListRowProps = {
  /** The pull request this row renders. */
  pr: PullRequest;
  /** Whether this row is the currently-selected PR. */
  active: boolean;
  /** Called with the PR id when the row is clicked. */
  onSelect: (id: string) => void;
};

/** Deterministic-ish background for the initials fallback, derived from the
 *  handle so a given user always gets the same color. */
const AVATAR_COLORS = [
  "#3fb950",
  "#a371f7",
  "#d29922",
  "#f85149",
  "#1f6feb",
  "#db61a2",
];
function colorFor(handle: string): string {
  let sum = 0;
  for (let i = 0; i < handle.length; i++) sum = (sum + handle.charCodeAt(i)) % 997;
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

/** A single ~16px avatar: GitHub image with an initials-on-color fallback for
 *  handles that 404 (bots, deleted users). */
function ReviewerAvatar({ reviewer }: { reviewer: PrReviewer }) {
  const { handle } = reviewer;
  const [failed, setFailed] = useState(false);
  const initial = handle.replace(/[^a-z0-9]/gi, "").charAt(0).toUpperCase() || "?";

  return (
    <span
      className="relative flex size-4 items-center justify-center rounded-full ring-1 ring-app-bg"
      style={{ backgroundColor: colorFor(handle) }}
      title={handle}
    >
      {failed ? (
        <span className="text-[8px] font-semibold leading-none text-white">
          {initial}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl(handle)}
          alt={handle}
          width={16}
          height={16}
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-4 rounded-full object-cover"
        />
      )}
    </span>
  );
}

export function PrListRow({ pr, active, onSelect }: PrListRowProps) {
  const failing = pr.ci === "failing";
  const merged = pr.status === "merged";
  const draft = pr.status === "draft";

  // Up to three reviewer avatars, overlapping.
  const avatars = pr.reviewers.slice(0, 3);
  const extraReviewers = pr.reviewers.length - avatars.length;

  return (
    <button
      type="button"
      onClick={() => onSelect(pr.id)}
      aria-current={active || undefined}
      className={cx(
        "flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors",
        active ? "bg-nav-active-bg" : "hover:bg-nav-active-bg/60"
      )}
    >
      {/* PR / branch glyph. Merged → purple merge glyph; draft → muted; a
          failing-CI status dot is overlaid on the open glyph. */}
      <span className="relative flex size-6 shrink-0 items-center justify-center">
        {merged ? (
          <CodeMergeIcon
            width={16}
            height={16}
            style={{ color: "#a371f7" }}
          />
        ) : (
          <CodePullRequestIcon
            width={16}
            height={16}
            className={draft ? "icon-faint" : "icon-muted"}
          />
        )}
        {failing && !merged ? (
          <span
            className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full"
            style={{ backgroundColor: "#f85149" }}
          />
        ) : null}
      </span>

      {/* Title (+ #number) and repo/branch metadata with inline facts. */}
      <div className="min-w-0 flex-1">
        <div
          className={cx(
            "truncate text-sm font-medium",
            active ? "text-text-strong" : "text-text-primary"
          )}
        >
          {pr.title}
          <span className="ml-1.5 font-normal text-text-faint">
            #{pr.number}
          </span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[12px] leading-4 text-text-secondary">
          <span className="truncate">{pr.repo}</span>
          <span className="truncate text-text-faint">{pr.branch}</span>

          {pr.commentCount > 0 ? (
            <span className="flex shrink-0 items-center gap-0.5 text-text-faint">
              <CommentGlyph />
              {pr.commentCount}
            </span>
          ) : null}

          {pr.filesChanged > 0 ? (
            <span className="flex shrink-0 items-center gap-0.5 text-text-faint">
              <FileGlyph />
              {pr.filesChanged}
            </span>
          ) : null}

          {pr.mergeable === "conflicts" ? (
            <span
              className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium leading-4"
              style={{ backgroundColor: "#f8514922", color: "#f85149" }}
            >
              conflicts
            </span>
          ) : pr.mergeable === "behind" ? (
            <span
              className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium leading-4"
              style={{ backgroundColor: "#d2992222", color: "#d29922" }}
            >
              behind
            </span>
          ) : null}
        </div>
      </div>

      {/* Reviewer cluster + updated label + diff counts. */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {avatars.length > 0 ? (
          <span className="flex items-center">
            <span className="flex -space-x-1.5">
              {avatars.map((r) => (
                <ReviewerAvatar key={r.handle} reviewer={r} />
              ))}
            </span>
            {extraReviewers > 0 ? (
              <span className="ml-1 text-[10px] leading-4 text-text-faint">
                +{extraReviewers}
              </span>
            ) : null}
          </span>
        ) : null}
        <span className="text-[11px] leading-4 text-text-faint">
          {pr.updatedLabel}
        </span>
        <span className="font-mono text-[12px] leading-4 tabular-nums">
          <span className="text-[color:var(--diff-add,#16a34a)]">
            +{pr.additions.toLocaleString()}
          </span>{" "}
          <span className="text-[color:var(--diff-remove,#dc2626)]">
            -{pr.deletions.toLocaleString()}
          </span>
        </span>
      </div>
    </button>
  );
}

/* Tiny inline glyphs for the metadata facts — kept local (and currentColor) so
   they read as muted text, not full icons. */
function CommentGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H6l-3 3v-3H3.5A1.5 1.5 0 0 1 2 9.5v-6Z" />
    </svg>
  );
}
function FileGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M4 1.5A1.5 1.5 0 0 0 2.5 3v10A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5V6L9 1.5H4Zm5 1.1L12.4 6H9V2.6Z" />
    </svg>
  );
}
