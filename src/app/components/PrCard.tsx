"use client";

/**
 * PrCard — a compact pill/card shown at the top of the transcript when a
 * message references a GitHub pull request URL.
 *
 * It renders a branch glyph, the PR title/prompt, the PR URL as a muted link,
 * and an optional right-aligned status chip ("Open" / "Merged" / "Closed").
 *
 * Owner / repo / number are parsed from the URL when not passed explicitly, so
 * a caller can hand it just `{ title, url }`. `extractPrUrl` is exported so the
 * transcript layer can scan a message body for a PR URL and decide whether to
 * mount the card at all.
 *
 * This is a "make it EXIST" component: it renders standalone with mock defaults
 * and is wired via typed props for later integration.
 */

import { GitBranchIcon, GlobeIcon } from "../chat/components/icons";

/* -------------------------------------------------------------------------- */
/* URL parsing                                                                 */
/* -------------------------------------------------------------------------- */

const PR_URL_RE =
  /https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i;

/**
 * Find the first `github.com/<owner>/<repo>/pull/<n>` URL in `text`.
 * Returns the matched url plus the parsed `owner/repo` and PR number, or null.
 */
export function extractPrUrl(
  text: string
): { url: string; repo: string; number: number } | null {
  const m = text.match(PR_URL_RE);
  if (!m) return null;
  return {
    url: m[0],
    repo: `${m[1]}/${m[2]}`,
    number: Number(m[3]),
  };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

type PrStatus = "open" | "merged" | "closed";

export type PrCardProps = {
  title: string;
  url: string;
  repo?: string;
  number?: number;
  status?: PrStatus;
};

/** Status chip color (label + dot). Inline hex is allowed for status only. */
const STATUS_STYLE: Record<PrStatus, { label: string; color: string }> = {
  open: { label: "Open", color: "#3fb950" },
  merged: { label: "Merged", color: "#a371f7" },
  closed: { label: "Closed", color: "#f85149" },
};

/** Strip the protocol/`www.` so the link reads like the reference host label. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(?:www\.)?/i, "");
}

export function PrCard({
  title = "find why is it failing",
  url = "https://github.com/openhackai/app/pull/115",
  repo,
  number,
  status = "open",
}: Partial<PrCardProps> = {}) {
  const parsed = extractPrUrl(url);
  const resolvedRepo = repo ?? parsed?.repo;
  const resolvedNumber = number ?? parsed?.number;
  const chip = STATUS_STYLE[status];

  return (
    <div
      className="animate-[prcard-in_180ms_var(--ease-out-quart)_both] mx-auto flex w-full max-w-[896px] items-center gap-2.5 rounded-[16.8px] border border-panel-border bg-bubble-bg px-3 py-2 text-sm"
    >
      {/* PR / branch glyph */}
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-composer-bg text-text-secondary">
        <GitBranchIcon width={14} height={14} />
      </span>

      {/* Title + URL */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium leading-5 text-text-strong">
          {title}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title={
            resolvedRepo && resolvedNumber
              ? `${resolvedRepo} #${resolvedNumber}`
              : url
          }
          className="flex items-center gap-1 truncate text-xs leading-4 text-text-secondary transition-colors hover:text-text-strong"
        >
          <GlobeIcon width={12} height={12} className="shrink-0 opacity-80" />
          <span className="truncate">{displayUrl(url)}</span>
        </a>
      </div>

      {/* Status chip */}
      <span
        className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-composer-bg px-2 py-0.5 text-xs font-medium leading-4"
        style={{ color: chip.color }}
      >
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: chip.color }}
        />
        {chip.label}
      </span>
    </div>
  );
}
