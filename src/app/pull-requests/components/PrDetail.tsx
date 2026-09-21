"use client";

/**
 * PrDetail — the right column (detail panel) of the "Pull requests" page: a
 * GitHub-PR-detail view for the currently-selected pull request.
 *
 * This panel is fully INTERACTIVE — every control does real work through the
 * passed-in `state: PrStateApi` (no dead buttons). The header carries a
 * Summary / Code toggle (Code renders the file-by-file <PrDiff/>), a
 * copy-link "open externally" control, a "Chat" button that jumps to the
 * composer, a Merge dropdown (merge / squash / rebase → state.mergePr, with
 * merged + conflict guards), and an expand-to-full-width toggle.
 *
 * The SUMMARY view renders the PR title + author, a compact meta table (branch,
 * reviewers with review-state rings + a "Request review" menu, comments, checks,
 * a ready/draft status menu), a mergeability banner (clean / conflicts /
 * behind → Update branch), a Description section, an expandable Checks card
 * (per-check logs, Fix / Fix all re-runs, running spinners, durations), and a
 * GitHub-style Activity feed whose thread / comment / finding rows expose
 * working ⋯ menus (reply, resolve, copy link, quote reply, copy prompt). It is
 * capped by a fully-working comment composer (Write/Preview tabs, send, a
 * Comment split with an Approve / Request changes / Comment review dropdown,
 * and ⌘/Ctrl+Enter to submit).
 *
 * Local state drives header tab, section/row disclosures, the composer draft,
 * and transient "copied" feedback. When `pr` is null it shows an empty state.
 */

import { useRef, useState } from "react";
import {
  CodePullRequestIcon,
  BranchMergeIcon,
  CodeForkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DotsIcon,
  CheckIcon,
  XIcon,
  GlobeIcon,
  EditIcon,
  ExpandFullIcon,
  GitBranchIcon,
  ArrowUpIcon,
  RobotIcon,
  FileIcon,
  RefreshIcon,
  AlertIcon,
  LinkIcon,
  PlusIcon,
} from "../../chat/components/icons";
import { Markdown } from "../../components/blocks/Markdown";
import { Menu, MenuItem, MenuSeparator, MenuHeading } from "../../components/ui/Menu";
import { Tooltip } from "../../components/ui/Tooltip";
import { PrDiff } from "./PrDiff";
import type { PrStateApi } from "../usePrState";
import {
  avatarUrl,
  type PullRequest,
  type PrCheck,
  type PrReviewer,
  type PrActivityItem,
  type CommitRef,
} from "../data";

/** Join conditional class parts (falsey entries dropped). */
const cx = (...parts: Array<string | false | undefined>) =>
  parts.filter(Boolean).join(" ");

/* Status / semantic hexes (inline hex is allowed for status only). */
const GREEN = "#3fb950";
const RED = "#f85149";
const AMBER = "#d29922";
const PURPLE = "#a371f7";

/** Handles offered in the "Request review" menu. */
const SUGGESTED_REVIEWERS = [
  "greptile-apps",
  "vercel",
  "openhack-agent",
  "coderabbitai",
];

/** Copy text to the clipboard (best-effort; resolves regardless of support). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* ignore — feedback still shows so the button is never dead */
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                      */
/* -------------------------------------------------------------------------- */

/** Deterministic accent color for a handle (fallback avatar background). */
function handleColor(handle: string): string {
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 55% 45%)`;
}

/** Up to two initials for a handle, used in the fallback avatar. */
function initials(handle: string): string {
  const clean = handle.replace(/[^a-z0-9]/gi, "");
  return (clean.slice(0, 2) || "?").toUpperCase();
}

/**
 * Real GitHub avatar image for a handle, with a subtle ring + fallback bg.
 * Made-up handles 404, so on image error we hide the <img> and show the
 * handle's initials on a colored circle instead.
 */
function Avatar({
  handle,
  size = 20,
  className,
  ring,
}: {
  handle: string;
  size?: number;
  className?: string;
  /** When set, draws a 2px app-bg ring (for overlapping stacks). */
  ring?: boolean;
}) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <span
        aria-label={handle}
        className={cx(
          "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
          ring && "ring-2 ring-app-bg",
          className,
        )}
        style={{
          width: size,
          height: size,
          backgroundColor: handleColor(handle),
          fontSize: Math.max(8, Math.round(size * 0.42)),
        }}
      >
        {initials(handle)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl(handle)}
      alt={handle}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setErrored(true)}
      className={cx(
        "shrink-0 rounded-full bg-bubble-bg object-cover",
        ring && "ring-2 ring-app-bg",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export function PrDetail({
  pr,
  state,
  scrollRef,
}: {
  pr: PullRequest | null;
  state: PrStateApi;
  scrollRef?: React.Ref<HTMLDivElement>;
}) {
  const [view, setView] = useState<"summary" | "code">("summary");
  const [descOpen, setDescOpen] = useState(true);
  const [checksOpen, setChecksOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(true);
  const [wide, setWide] = useState(false);
  const [copied, setCopied] = useState(false);

  // Composer wiring — lives here so header "Chat" / "Quote reply" can focus it.
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");

  const focusComposer = () => {
    setView("summary");
    setActivityOpen(true);
    // Wait a tick so the composer is mounted/visible before we scroll to it.
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.focus();
      }
    });
  };

  const quoteReply = (text: string) => {
    const quoted =
      text
        .trim()
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n") + "\n\n";
    setDraft((cur) => (cur ? `${cur}\n${quoted}` : quoted));
    focusComposer();
  };

  if (!pr) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-secondary">
        Select a pull request
      </div>
    );
  }

  const reviewers = pr.reviewers ?? [];
  const checks = pr.checks ?? [];
  const activity = pr.activity ?? [];

  const merged = pr.status === "merged";
  const conflicts = pr.mergeable === "conflicts";
  const prLink = `https://github.com/${pr.repo}/pull/${pr.number}`;

  const ciWord =
    pr.ci === "failing"
      ? { label: "Failing", color: RED }
      : pr.ci === "passing"
        ? { label: "Passing", color: GREEN }
        : { label: "Pending", color: AMBER };

  const onCopyLink = async () => {
    await copyText(prLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="flex h-full flex-col bg-app-bg">
      {/* Header strip */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-panel-border px-2">
        <span className="flex size-6 shrink-0 items-center justify-center">
          <CodePullRequestIcon width={16} height={16} className="icon-muted" />
        </span>
        <div className="flex items-center gap-0.5">
          {(["summary", "code"] as const).map((k) => {
            const isActive = view === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                className={cx(
                  "h-7 rounded-full px-3 text-[13px] font-medium capitalize leading-5 transition-colors duration-150 ease-out",
                  isActive
                    ? "bg-bubble-bg text-text-strong"
                    : "text-text-secondary hover:text-text-strong",
                )}
              >
                {k}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Tooltip label={copied ? "Copied" : "Copy link"}>
            <button
              type="button"
              aria-label={copied ? "Link copied" : "Copy link to pull request"}
              onClick={onCopyLink}
              className="flex size-6 shrink-0 items-center justify-center rounded-[8.4px] border-[0.556px] border-transparent icon-muted transition-[opacity,background-color] duration-150 ease-out hover:bg-bubble-bg hover:opacity-100"
            >
              <span className="flex size-[18px] shrink-0 items-center justify-center [&>svg]:shrink-0">
                {copied ? (
                  <CheckIcon width={16} height={16} style={{ color: GREEN }} />
                ) : (
                  <GlobeIcon width={18} height={18} />
                )}
              </span>
            </button>
          </Tooltip>

          <Tooltip label="Jump to comment box">
            <button
              type="button"
              onClick={focusComposer}
              className="flex h-8 items-center rounded-full px-3 text-[13px] font-medium leading-5 text-text-secondary transition-colors duration-150 ease-out hover:bg-bubble-bg hover:text-text-strong"
            >
              Chat
            </button>
          </Tooltip>

          <MergeControl pr={pr} state={state} merged={merged} conflicts={conflicts} />

          <Tooltip label={wide ? "Constrain width" : "Expand to full width"}>
            <button
              type="button"
              aria-label={wide ? "Constrain content width" : "Expand to full width"}
              aria-pressed={wide}
              onClick={() => setWide((v) => !v)}
              className={cx(
                "flex size-6 shrink-0 items-center justify-center rounded-[8.4px] border-[0.556px] border-transparent transition-[opacity,background-color] duration-150 ease-out hover:bg-bubble-bg hover:opacity-100",
                wide ? "bg-bubble-bg text-text-strong" : "icon-muted",
              )}
            >
              <span className="flex size-[18px] shrink-0 items-center justify-center [&>svg]:shrink-0">
                <ExpandFullIcon width={18} height={18} />
              </span>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Scroll area */}
      <div
        ref={scrollRef}
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto outline-none"
      >
        {view === "code" ? (
          <PrDiff pr={pr} state={state} />
        ) : (
          <div className={cx("pb-10", wide ? "px-5" : "mx-auto max-w-[840px] px-5")}>
            {/* Title block */}
            <div className="px-1 pt-4">
              <div className="flex items-start gap-2">
                <h1 className="min-w-0 flex-1 text-[22px] font-semibold leading-7 tracking-tight text-text-strong">
                  {pr.title}
                </h1>
                <Tooltip label="Edit title">
                  <button
                    type="button"
                    aria-label="Edit title"
                    onClick={focusComposer}
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[8px] icon-muted transition-colors duration-150 ease-out hover:bg-bubble-bg"
                  >
                    <EditIcon width={16} height={16} />
                  </button>
                </Tooltip>
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <Avatar handle={pr.authorHandle} size={20} />
                <span className="text-text-primary">{pr.authorHandle}</span>
                <span className="text-text-faint">·</span>
                <span className="text-text-secondary">{pr.updatedLabel}</span>
                {merged ? (
                  <span
                    className="ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium leading-4 text-white"
                    style={{ backgroundColor: PURPLE }}
                  >
                    <BranchMergeIcon width={12} height={12} />
                    Merged
                  </span>
                ) : null}
              </div>
            </div>

            {/* Meta table */}
            <div className="mt-5 flex flex-col gap-2.5 px-1">
              <MetaRow icon={<CodeForkIcon width={14} height={14} />} label="Branch">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate font-mono text-[12px] leading-4 text-text-primary">
                    {pr.branch}
                  </span>
                  <ChevronRightIcon width={12} height={12} className="shrink-0 icon-faint" />
                  <span className="shrink-0 font-mono text-[12px] leading-4 text-text-secondary">
                    {pr.baseBranch}
                  </span>
                  <span className="ml-1 flex shrink-0 items-center gap-1.5 font-mono text-[12px] leading-4 tabular-nums">
                    <span className="text-[color:var(--diff-add,#16a34a)]">
                      +{pr.additions.toLocaleString()}
                    </span>
                    <span className="text-[color:var(--diff-remove,#dc2626)]">
                      -{pr.deletions.toLocaleString()}
                    </span>
                  </span>
                </div>
              </MetaRow>

              <MetaRow label="Reviewers">
                <div className="flex items-center">
                  {reviewers.length ? (
                    <div className="flex items-center">
                      {reviewers.map((r, i) => (
                        <ReviewerAvatar key={r.handle} reviewer={r} first={i === 0} />
                      ))}
                    </div>
                  ) : (
                    <span className="mr-1 text-sm text-text-faint">—</span>
                  )}
                  <Menu
                    trigger={
                      <button
                        type="button"
                        aria-label="Request review"
                        className="ml-1.5 flex size-6 items-center justify-center rounded-full icon-muted transition-colors duration-150 ease-out hover:bg-bubble-bg data-[popup-open]:bg-bubble-bg"
                      >
                        {reviewers.length ? (
                          <DotsIcon width={16} height={16} />
                        ) : (
                          <PlusIcon width={15} height={15} />
                        )}
                      </button>
                    }
                    align="end"
                    popupClassName="min-w-[220px]"
                  >
                    <MenuHeading>Request review</MenuHeading>
                    {SUGGESTED_REVIEWERS.map((handle) => {
                      const present = reviewers.some((r) => r.handle === handle);
                      return (
                        <MenuItem
                          key={handle}
                          icon={<Avatar handle={handle} size={16} />}
                          label={handle}
                          disabled={present}
                          trailing={
                            present ? (
                              <CheckIcon
                                width={14}
                                height={14}
                                style={{ color: GREEN }}
                              />
                            ) : undefined
                          }
                          onSelect={
                            present
                              ? undefined
                              : () => state.requestReviewer(pr.id, handle)
                          }
                        />
                      );
                    })}
                  </Menu>
                </div>
              </MetaRow>

              <MetaRow label="Comments">
                <span className="text-sm text-text-primary">
                  {pr.commentCount} comments
                </span>
              </MetaRow>

              <MetaRow label="Checks">
                <span className="text-sm font-medium" style={{ color: ciWord.color }}>
                  {ciWord.label}
                </span>
              </MetaRow>

              <MetaRow label="Status">
                <Menu
                  trigger={
                    <button
                      type="button"
                      className="flex items-center gap-1 text-sm text-text-primary transition-colors duration-150 ease-out hover:text-text-strong data-[popup-open]:text-text-strong"
                    >
                      {merged
                        ? "Merged"
                        : pr.status === "draft"
                          ? "Draft"
                          : pr.readyLabel ?? "Open"}
                      <ChevronDownIcon width={14} height={14} className="icon-muted" />
                    </button>
                  }
                  align="start"
                >
                  <MenuItem
                    icon={<CheckIcon width={15} height={15} />}
                    label="Mark as ready"
                    disabled={pr.status !== "draft"}
                    onSelect={() => state.setReady(pr.id, true)}
                  />
                  <MenuItem
                    icon={<EditIcon width={15} height={15} />}
                    label="Convert to draft"
                    disabled={pr.status === "draft" || merged}
                    onSelect={() => state.setReady(pr.id, false)}
                  />
                </Menu>
              </MetaRow>
            </div>

            {/* Mergeability banner */}
            <MergeabilityBanner pr={pr} state={state} merged={merged} />

            {/* Description */}
            <Section
              className="mt-6"
              title="Description"
              open={descOpen}
              onToggle={() => setDescOpen((v) => !v)}
              action={
                <Tooltip label="Edit description">
                  <button
                    type="button"
                    aria-label="Edit description"
                    onClick={focusComposer}
                    className="flex size-6 items-center justify-center rounded-[8px] icon-muted transition-colors duration-150 ease-out hover:bg-bubble-bg"
                  >
                    <EditIcon width={15} height={15} />
                  </button>
                </Tooltip>
              }
            >
              {pr.description ? (
                <div className="px-1">
                  <Markdown text={pr.description} />
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-text-faint">
                  No description provided
                </p>
              )}
            </Section>

            {/* Checks */}
            {checks.length ? (
              <Section
                className="mt-6"
                title="Checks"
                open={checksOpen}
                onToggle={() => setChecksOpen((v) => !v)}
                action={
                  checks.some((c) => c.status === "failed") ? (
                    <button
                      type="button"
                      onClick={() => state.rerunAllChecks(pr.id)}
                      className="text-[13px] text-text-secondary transition-colors duration-150 ease-out hover:text-text-strong"
                    >
                      Fix all
                    </button>
                  ) : undefined
                }
              >
                <div className="overflow-hidden rounded-[14px] border border-card-border bg-row-bg divide-y divide-row-divider">
                  {checks.map((check) => (
                    <CheckRow key={check.name} check={check} pr={pr} state={state} />
                  ))}
                </div>
              </Section>
            ) : null}

            {/* Activity */}
            {activity.length ? (
              <Section
                className="mt-6"
                title="Activity"
                count={activity.length}
                open={activityOpen}
                onToggle={() => setActivityOpen((v) => !v)}
              >
                <div className="flex flex-col gap-2">
                  {activity.map((item) => (
                    <ActivityItem
                      key={item.id}
                      item={item}
                      pr={pr}
                      state={state}
                      onQuoteReply={quoteReply}
                    />
                  ))}
                </div>
                <CommentComposer
                  pr={pr}
                  state={state}
                  draft={draft}
                  setDraft={setDraft}
                  textareaRef={composerRef}
                />
              </Section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Header merge control                                                        */
/* -------------------------------------------------------------------------- */

/** The header Merge affordance: a method dropdown, a conflict guard, or the
 *  merged pill — so the button always reflects the PR's real mergeability. */
function MergeControl({
  pr,
  state,
  merged,
  conflicts,
}: {
  pr: PullRequest;
  state: PrStateApi;
  merged: boolean;
  conflicts: boolean;
}) {
  if (merged) {
    return (
      <button
        type="button"
        disabled
        className="flex h-8 cursor-default items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold leading-5 text-white"
        style={{ backgroundColor: PURPLE }}
      >
        <BranchMergeIcon width={14} height={14} />
        Merged
      </button>
    );
  }

  if (conflicts) {
    return (
      <Menu
        trigger={
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-full border border-control-border px-3 text-[13px] font-semibold leading-5 transition-colors duration-150 ease-out hover:bg-bubble-bg"
            style={{ color: RED }}
          >
            <AlertIcon width={14} height={14} />
            Resolve conflicts
            <ChevronDownIcon width={14} height={14} className="opacity-70" />
          </button>
        }
        align="end"
        popupClassName="min-w-[260px]"
      >
        <MenuHeading>Merge blocked</MenuHeading>
        <MenuItem
          label="Resolve conflicts on the head branch, then re-run checks."
          disabled
          descriptionBelow
        />
      </Menu>
    );
  }

  return (
    <Menu
      trigger={
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-full bg-btn-solid-bg px-3 text-[13px] font-semibold leading-5 text-btn-solid-text transition-opacity duration-150 ease-out hover:opacity-90 data-[popup-open]:opacity-90"
        >
          <BranchMergeIcon width={14} height={14} />
          Merge
          <ChevronDownIcon width={14} height={14} className="opacity-70" />
        </button>
      }
      align="end"
      popupClassName="min-w-[220px]"
    >
      <MenuHeading>Merge method</MenuHeading>
      <MenuItem
        icon={<BranchMergeIcon width={15} height={15} />}
        label="Create a merge commit"
        onSelect={() => state.mergePr(pr.id, "merge")}
      />
      <MenuItem
        icon={<GitBranchIcon width={15} height={15} />}
        label="Squash and merge"
        onSelect={() => state.mergePr(pr.id, "squash")}
      />
      <MenuItem
        icon={<CodeForkIcon width={15} height={15} />}
        label="Rebase and merge"
        onSelect={() => state.mergePr(pr.id, "rebase")}
      />
    </Menu>
  );
}

/* -------------------------------------------------------------------------- */
/* Mergeability banner                                                         */
/* -------------------------------------------------------------------------- */

function MergeabilityBanner({
  pr,
  state,
  merged,
}: {
  pr: PullRequest;
  state: PrStateApi;
  merged: boolean;
}) {
  if (merged) {
    return (
      <div
        className="mt-5 flex items-center gap-2 rounded-[12px] border px-3 py-2.5"
        style={{ borderColor: `${PURPLE}55`, backgroundColor: `${PURPLE}14` }}
      >
        <BranchMergeIcon width={16} height={16} style={{ color: PURPLE }} />
        <span className="text-[13px] leading-5 text-text-primary">
          This pull request has been merged into{" "}
          <span className="font-mono text-text-strong">{pr.baseBranch}</span>.
        </span>
      </div>
    );
  }

  if (pr.mergeable === "conflicts") {
    return (
      <div
        className="mt-5 flex items-center gap-2 rounded-[12px] border px-3 py-2.5"
        style={{ borderColor: `${RED}55`, backgroundColor: `${RED}14` }}
      >
        <AlertIcon width={16} height={16} style={{ color: RED }} />
        <span className="min-w-0 flex-1 text-[13px] leading-5 text-text-primary">
          This branch has conflicts that must be resolved
        </span>
        <Menu
          trigger={
            <button
              type="button"
              className="shrink-0 rounded-full border border-control-border px-2.5 py-1 text-[12px] font-medium leading-4 transition-colors duration-150 ease-out hover:bg-bubble-bg data-[popup-open]:bg-bubble-bg"
              style={{ color: RED }}
            >
              Resolve conflicts
            </button>
          }
          side="top"
          align="end"
          popupClassName="min-w-[260px]"
        >
          <MenuHeading>Conflicting files</MenuHeading>
          <MenuItem
            label="Resolve these conflicts on your branch, then push to re-run checks."
            disabled
            descriptionBelow
          />
        </Menu>
      </div>
    );
  }

  if (pr.mergeable === "behind") {
    return (
      <div
        className="mt-5 flex items-center gap-2 rounded-[12px] border px-3 py-2.5"
        style={{ borderColor: `${AMBER}55`, backgroundColor: `${AMBER}14` }}
      >
        <ClockDot />
        <span className="min-w-0 flex-1 text-[13px] leading-5 text-text-primary">
          This branch is out-of-date with the base branch ({pr.behindBy} commits
          behind)
        </span>
        <button
          type="button"
          onClick={() => state.updateBranch(pr.id)}
          className="shrink-0 flex items-center gap-1 rounded-full border border-control-border px-2.5 py-1 text-[12px] font-medium leading-4 text-text-secondary transition-colors duration-150 ease-out hover:bg-bubble-bg hover:text-text-strong"
        >
          <RefreshIcon width={13} height={13} />
          Update branch
        </button>
      </div>
    );
  }

  // clean
  return (
    <div
      className="mt-5 flex items-center gap-2 rounded-[12px] border px-3 py-2.5"
      style={{ borderColor: `${GREEN}55`, backgroundColor: `${GREEN}14` }}
    >
      <CheckIcon width={16} height={16} style={{ color: GREEN }} />
      <span className="min-w-0 flex-1 text-[13px] leading-5 text-text-primary">
        This branch has no conflicts with the base branch
      </span>
      <span className="shrink-0 text-[12px] font-medium leading-4" style={{ color: GREEN }}>
        Ready to merge
      </span>
    </div>
  );
}

/** A small amber "behind" dot for the mergeability banner. */
function ClockDot() {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      <span className="size-2.5 rounded-full" style={{ backgroundColor: AMBER }} />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Header + meta sub-components                                                 */
/* -------------------------------------------------------------------------- */

function MetaRow({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex w-[92px] shrink-0 items-center gap-1.5 text-[13px] leading-5 text-text-secondary">
        {icon ? <span className="flex icon-faint">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}

/** Ring color for a reviewer's review state. */
function reviewerRing(state: PrReviewer["state"]): {
  color: string;
  dashed: boolean;
  word: string;
} {
  switch (state) {
    case "approved":
      return { color: GREEN, dashed: false, word: "approved" };
    case "changes_requested":
      return { color: RED, dashed: false, word: "changes requested" };
    case "commented":
      return { color: "var(--icon-muted, #8b949e)", dashed: false, word: "commented" };
    case "pending":
    default:
      return { color: "var(--icon-faint, #6e7681)", dashed: true, word: "review pending" };
  }
}

/** Overlapping reviewer avatar — a real GitHub image with a state ring + tip. */
function ReviewerAvatar({
  reviewer,
  first,
}: {
  reviewer: PrReviewer;
  first: boolean;
}) {
  const ring = reviewerRing(reviewer.state);
  return (
    <Tooltip label={`${reviewer.handle} — ${ring.word}`}>
      <span
        className={cx("relative flex rounded-full p-[2px]", !first && "-ml-1.5")}
        style={{
          backgroundColor: "var(--app-bg)",
          boxShadow: ring.dashed
            ? `0 0 0 1.5px var(--app-bg)`
            : undefined,
        }}
      >
        <span
          className="flex rounded-full p-[1.5px]"
          style={{
            border: `1.5px ${ring.dashed ? "dashed" : "solid"} ${ring.color}`,
          }}
        >
          <Avatar handle={reviewer.handle} size={22} />
        </span>
      </span>
    </Tooltip>
  );
}

function Section({
  title,
  count,
  open,
  onToggle,
  action,
  className,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className}>
      <div className="flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <ChevronDownIcon
            width={14}
            height={14}
            className={cx(
              "shrink-0 icon-muted transition-transform duration-150 ease-out",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
          <span className="text-sm font-semibold leading-5 text-text-strong">
            {title}
          </span>
          {count !== undefined ? (
            <span className="text-[13px] leading-5 text-text-faint tabular-nums">
              {count}
            </span>
          ) : null}
        </button>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {open ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                      */
/* -------------------------------------------------------------------------- */

function CheckRow({
  check,
  pr,
  state,
}: {
  check: PrCheck;
  pr: PullRequest;
  state: PrStateApi;
}) {
  const [open, setOpen] = useState(false);
  const expandable = !!check.log;

  return (
    <div>
      <div className="flex h-11 items-center gap-2.5 px-3">
        {expandable ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Hide log" : "Show log"}
            className="flex size-5 shrink-0 items-center justify-center rounded icon-muted hover:bg-bubble-bg"
          >
            <ChevronRightIcon
              width={13}
              height={13}
              className={cx("transition-transform duration-150 ease-out", open && "rotate-90")}
            />
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}

        <CheckGlyph status={check.status} />
        <span className="min-w-0 flex-1 truncate text-sm leading-5 text-text-primary">
          {check.name}
        </span>

        {check.status === "passed" ? (
          <span className="shrink-0 text-[13px] leading-5 text-text-faint">
            {check.durationLabel ? `Passed · ${check.durationLabel}` : "Passed"}
          </span>
        ) : check.status === "running" ? (
          <span
            className="flex shrink-0 items-center gap-1.5 text-[13px] leading-5"
            style={{ color: AMBER }}
          >
            <span
              className="size-2 animate-pulse rounded-full"
              style={{ backgroundColor: AMBER }}
            />
            Running…
          </span>
        ) : check.status === "failed" ? (
          <button
            type="button"
            onClick={() => state.rerunCheck(pr.id, check.name)}
            className="shrink-0 rounded-full border border-control-border px-2.5 py-0.5 text-[13px] leading-5 text-text-secondary transition-colors duration-150 ease-out hover:text-text-strong hover:bg-bubble-bg"
          >
            {check.actionLabel ?? "Fix"}
          </button>
        ) : (
          <span className="shrink-0 text-[13px] leading-5 text-text-faint">
            Pending
          </span>
        )}
      </div>

      {expandable && open ? (
        <div className="px-3 pb-3">
          <pre className="overflow-x-auto rounded-[10px] bg-code-bg px-3 py-2.5 font-mono text-[12px] leading-5 text-text-secondary">
            {check.log}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function CheckGlyph({ status }: { status: PrCheck["status"] }) {
  if (status === "passed") {
    return (
      <span
        className="flex size-5 shrink-0 items-center justify-center"
        style={{ color: GREEN }}
      >
        <CheckIcon width={16} height={16} />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: RED, color: "#fff" }}
      >
        <XIcon width={12} height={12} />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center">
        <span
          className="size-2.5 animate-pulse rounded-full"
          style={{ backgroundColor: AMBER }}
        />
      </span>
    );
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center">
      <span className="size-2 rounded-full" style={{ backgroundColor: AMBER }} />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Activity feed                                                               */
/* -------------------------------------------------------------------------- */

/** A card shell used by most activity rows (border + row bg). */
function ActivityCard({
  children,
  className,
  selected,
}: {
  children: React.ReactNode;
  className?: string;
  /** Draws a primary-colored ring, matching GitHub's focused-item state. */
  selected?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-[12px] border bg-row-bg",
        selected
          ? "border-[var(--primary)] ring-1 ring-[var(--primary)]"
          : "border-card-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Dispatch one activity item to its renderer by kind. */
function ActivityItem({
  item,
  pr,
  state,
  onQuoteReply,
}: {
  item: PrActivityItem;
  pr: PullRequest;
  state: PrStateApi;
  onQuoteReply: (text: string) => void;
}) {
  switch (item.kind) {
    case "commit":
      return <CommitRow item={item} />;
    case "commit-group":
      return <CommitGroupRow item={item} />;
    case "opened":
      return <OpenedRow item={item} />;
    case "thread":
      return <ThreadRow item={item} pr={pr} state={state} />;
    case "review":
      return <ReviewRow item={item} />;
    case "finding":
      return <FindingCard item={item} pr={pr} onQuoteReply={onQuoteReply} />;
    case "comment":
    default:
      return <CommentRow item={item} pr={pr} onQuoteReply={onQuoteReply} />;
  }
}

function CommitRow({ item }: { item: PrActivityItem }) {
  const c = item.commit;
  if (!c) return null;
  return (
    <ActivityCard className="flex h-11 items-center gap-2.5 px-3">
      <GitBranchIcon width={15} height={15} className="shrink-0 icon-faint" />
      <span className="min-w-0 flex-1 truncate text-sm leading-5 text-text-primary">
        {c.message}
      </span>
      <span className="shrink-0 font-mono text-[12px] leading-4 text-text-faint">
        {c.sha}
      </span>
      <Avatar handle={c.author} size={20} />
      <span className="shrink-0 text-[12px] leading-4 text-text-faint tabular-nums">
        {c.time}
      </span>
    </ActivityCard>
  );
}

function OpenedRow({ item }: { item: PrActivityItem }) {
  return (
    <ActivityCard className="flex h-11 items-center gap-2.5 px-3">
      <CodePullRequestIcon width={15} height={15} className="shrink-0 icon-muted" />
      <span className="min-w-0 flex-1 truncate text-sm leading-5 text-text-primary">
        <span className="font-medium text-text-strong">{item.actor}</span> opened
        this pull request
      </span>
      <span className="shrink-0 text-[12px] leading-4 text-text-faint tabular-nums">
        {item.time}
      </span>
    </ActivityCard>
  );
}

/** A collapsible "N commits" disclosure that expands to the individual commits. */
function CommitGroupRow({ item }: { item: PrActivityItem }) {
  const [open, setOpen] = useState(false);
  const commits = item.commits ?? [];
  return (
    <div className="flex flex-col gap-0.5">
      <ActivityCard>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex h-11 w-full items-center gap-2.5 px-3 text-left"
        >
          <GitBranchIcon width={15} height={15} className="shrink-0 icon-faint" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium leading-5 text-text-strong">
            {commits.length} commits
          </span>
          <ChevronDownIcon
            width={14}
            height={14}
            className={cx(
              "shrink-0 icon-muted transition-transform duration-150 ease-out",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
          <span className="shrink-0 text-[12px] leading-4 text-text-faint tabular-nums">
            {item.time}
          </span>
        </button>
      </ActivityCard>
      {open ? (
        <div className="ml-3 flex flex-col gap-0.5 border-l border-card-border pl-3">
          {commits.map((c) => (
            <CommitLine key={c.sha} commit={c} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CommitLine({ commit }: { commit: CommitRef }) {
  return (
    <div className="flex h-9 items-center gap-2.5 rounded-[8px] px-2 hover:bg-bubble-bg">
      <GitBranchIcon width={14} height={14} className="shrink-0 icon-faint" />
      <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-text-primary">
        {commit.message}
      </span>
      <span className="shrink-0 font-mono text-[12px] leading-4 text-text-faint">
        {commit.sha}
      </span>
      <Avatar handle={commit.author} size={18} />
      <span className="shrink-0 text-[12px] leading-4 text-text-faint tabular-nums">
        {commit.time}
      </span>
    </div>
  );
}

/** A resolved/unresolved review thread anchored to a file. */
function ThreadRow({
  item,
  pr,
  state,
}: {
  item: PrActivityItem;
  pr: PullRequest;
  state: PrStateApi;
}) {
  return (
    <ActivityCard className="flex items-center gap-2.5 px-3 py-2.5">
      <Avatar handle={item.actor} size={20} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium leading-5 text-text-strong">
            {item.actor}
          </span>
          {item.resolved ? (
            <span className="flex items-center gap-1 text-[12px] leading-4 text-text-secondary">
              <CheckIcon width={12} height={12} style={{ color: GREEN }} />
              Resolved
            </span>
          ) : null}
          {item.replies ? (
            <span className="text-[12px] leading-4 text-text-faint">
              · {item.replies} {item.replies === 1 ? "reply" : "replies"}
            </span>
          ) : null}
        </div>
        {item.file ? (
          <span className="mt-0.5 flex items-center gap-1 font-mono text-[12px] leading-4 text-text-secondary">
            <FileIcon width={12} height={12} className="icon-faint" />
            {item.file}
          </span>
        ) : null}
      </div>
      <span className="shrink-0 text-[12px] leading-4 text-text-faint tabular-nums">
        {item.time}
      </span>
      <Menu
        trigger={
          <button
            type="button"
            aria-label="Thread options"
            className="flex size-6 shrink-0 items-center justify-center rounded-full icon-muted transition-colors hover:bg-bubble-bg data-[popup-open]:bg-bubble-bg"
          >
            <DotsIcon width={16} height={16} />
          </button>
        }
        align="end"
      >
        <MenuItem
          icon={<ChevronRightIcon width={15} height={15} />}
          label="Reply"
          onSelect={() => state.replyToThread(pr.id, item.id)}
        />
        <MenuItem
          icon={<CheckIcon width={15} height={15} />}
          label={item.resolved ? "Mark as unresolved" : "Mark as resolved"}
          onSelect={() => state.toggleThreadResolved(pr.id, item.id)}
        />
      </Menu>
    </ActivityCard>
  );
}

/** The ⋯ menu shared by comment + finding cards: copy link + quote reply. */
function CommentMenu({
  pr,
  item,
  onQuoteReply,
}: {
  pr: PullRequest;
  item: PrActivityItem;
  onQuoteReply: (text: string) => void;
}) {
  const link = `https://github.com/${pr.repo}/pull/${pr.number}#${item.id}`;
  return (
    <Menu
      trigger={
        <button
          type="button"
          aria-label="Comment options"
          className="flex size-6 shrink-0 items-center justify-center rounded-full icon-muted transition-colors hover:bg-bubble-bg data-[popup-open]:bg-bubble-bg"
        >
          <DotsIcon width={16} height={16} />
        </button>
      }
      align="end"
    >
      <MenuItem
        icon={<LinkIcon width={15} height={15} />}
        label="Copy link"
        onSelect={() => void copyText(link)}
      />
      <MenuItem
        icon={<ChevronRightIcon width={15} height={15} />}
        label="Quote reply"
        onSelect={() =>
          onQuoteReply(item.body ?? item.title ?? `Comment by ${item.actor}`)
        }
      />
    </Menu>
  );
}

/** A plain human/bot comment with a markdown body. */
function CommentRow({
  item,
  pr,
  onQuoteReply,
}: {
  item: PrActivityItem;
  pr: PullRequest;
  onQuoteReply: (text: string) => void;
}) {
  return (
    <ActivityCard className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-card-border px-3 py-2">
        <Avatar handle={item.actor} size={22} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium leading-5 text-text-strong">
          {item.actor}
        </span>
        <span className="shrink-0 text-[12px] leading-4 text-text-faint tabular-nums">
          {item.time}
        </span>
        <CommentMenu pr={pr} item={item} onQuoteReply={onQuoteReply} />
      </div>
      {item.body ? (
        <div className="px-3 py-2.5">
          <Markdown text={item.body} />
        </div>
      ) : null}
    </ActivityCard>
  );
}

function ReviewRow({ item }: { item: PrActivityItem }) {
  return (
    <ActivityCard className="flex h-11 items-center gap-2.5 px-3">
      <Avatar handle={item.actor} size={20} />
      <span className="min-w-0 flex-1 truncate text-sm leading-5 text-text-primary">
        <span className="font-medium text-text-strong">{item.actor}</span>{" "}
        {item.reviewVerb ?? "reviewed"}
      </span>
      <span className="shrink-0 text-[12px] leading-4 text-text-faint tabular-nums">
        {item.time}
      </span>
    </ActivityCard>
  );
}

/**
 * A rich agent/bot finding card: header (avatar + actor + time + ⋯ menu), a
 * markdown body, an optional collapsible "Prompt to fix with AI" block with a
 * copy button, an image grid, an italic note, and a highlighted tip callout.
 */
function FindingCard({
  item,
  pr,
  onQuoteReply,
}: {
  item: PrActivityItem;
  pr: PullRequest;
  onQuoteReply: (text: string) => void;
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    if (!item.fixPrompt) return;
    await copyText(item.fixPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <ActivityCard className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-card-border px-3 py-2">
        <Avatar handle={item.actor} size={22} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium leading-5 text-text-strong">
          {item.actor}
        </span>
        <span className="shrink-0 text-[12px] leading-4 text-text-faint tabular-nums">
          {item.time}
        </span>
        <CommentMenu pr={pr} item={item} onQuoteReply={onQuoteReply} />
      </div>

      <div className="px-3.5 py-3">
        {item.title ? (
          <h3 className="mb-2 text-[17px] font-semibold leading-6 text-text-strong">
            {item.title}
          </h3>
        ) : null}
        {item.body ? <Markdown text={item.body} /> : null}

        {/* Prompt to fix with AI — collapsible */}
        {item.fixPrompt ? (
          <div className="mt-3 overflow-hidden rounded-[10px] border border-card-border bg-bubble-bg">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => setPromptOpen((v) => !v)}
                aria-expanded={promptOpen}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <ChevronRightIcon
                  width={13}
                  height={13}
                  className={cx(
                    "shrink-0 icon-muted transition-transform duration-150 ease-out",
                    promptOpen && "rotate-90",
                  )}
                />
                <RobotIcon width={15} height={15} className="shrink-0 icon-muted" />
                <span className="text-[13px] font-medium leading-5 text-text-primary">
                  Prompt To Fix With AI
                </span>
              </button>
              <button
                type="button"
                onClick={copyPrompt}
                className="flex shrink-0 items-center gap-1 rounded-full border border-control-border px-2 py-0.5 text-[12px] leading-4 text-text-secondary transition-colors duration-150 ease-out hover:text-text-strong hover:bg-row-bg"
              >
                {copied ? (
                  <CheckIcon width={12} height={12} style={{ color: GREEN }} />
                ) : (
                  <LinkIcon width={12} height={12} />
                )}
                {copied ? "Copied" : "Copy prompt"}
              </button>
            </div>
            {promptOpen ? (
              <div className="border-t border-card-border px-3 py-2.5">
                <p className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-text-secondary">
                  {item.fixPrompt}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {item.note ? (
          <p className="mt-3 text-[13px] italic leading-5 text-text-secondary">
            {item.note}
          </p>
        ) : null}

        {item.tip ? (
          <div className="mt-3 border-l-2 border-[var(--primary)] pl-3">
            <div className="text-[13px] leading-5 text-text-secondary">
              <Markdown text={item.tip} />
            </div>
          </div>
        ) : null}
      </div>
    </ActivityCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Comment composer                                                            */
/* -------------------------------------------------------------------------- */

/** "Leave a comment" composer pinned to the bottom of the activity feed. */
function CommentComposer({
  pr,
  state,
  draft,
  setDraft,
  textareaRef,
}: {
  pr: PullRequest;
  state: PrStateApi;
  draft: string;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const empty = draft.trim().length === 0;

  const sendComment = () => {
    if (empty) return;
    state.addComment(pr.id, draft);
    setDraft("");
    setTab("write");
  };

  const submitReview = (kind: "approve" | "request_changes" | "comment") => {
    state.submitReview(pr.id, kind, draft);
    setDraft("");
    setTab("write");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      sendComment();
    }
  };

  return (
    <div className="mt-3 rounded-[12px] border border-card-border bg-row-bg p-2.5">
      {/* Write / Preview tabs */}
      <div className="mb-2 flex items-center gap-0.5">
        {(["write", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cx(
              "h-7 rounded-full px-3 text-[12px] font-medium capitalize leading-5 transition-colors duration-150 ease-out",
              tab === t
                ? "bg-bubble-bg text-text-strong"
                : "text-text-secondary hover:text-text-strong",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "write" ? (
        <textarea
          ref={textareaRef}
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Leave a comment"
          className="min-h-[64px] w-full resize-none bg-transparent px-1 py-1 text-sm leading-5 text-text-primary outline-none placeholder:text-text-faint"
        />
      ) : (
        <div className="min-h-[64px] px-1 py-1">
          {empty ? (
            <p className="text-sm text-text-faint">Nothing to preview</p>
          ) : (
            <Markdown text={draft} />
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-text-faint">
          Markdown supported · ⌘↵ to comment
        </span>

        <div className="flex items-center gap-2">
          {/* Comment split: primary comment + review dropdown */}
          <div className="flex items-center overflow-hidden rounded-full border border-control-border">
            <button
              type="button"
              onClick={sendComment}
              disabled={empty}
              className="h-7 px-3 text-[12px] font-semibold leading-5 text-text-strong transition-colors duration-150 ease-out hover:bg-bubble-bg disabled:cursor-not-allowed disabled:text-text-faint disabled:hover:bg-transparent"
            >
              Comment
            </button>
            <Menu
              trigger={
                <button
                  type="button"
                  aria-label="Review options"
                  className="flex h-7 w-6 items-center justify-center border-l border-control-border icon-muted transition-colors duration-150 ease-out hover:bg-bubble-bg data-[popup-open]:bg-bubble-bg"
                >
                  <ChevronDownIcon width={13} height={13} />
                </button>
              }
              side="top"
              align="end"
              popupClassName="min-w-[200px]"
            >
              <MenuHeading>Submit review</MenuHeading>
              <MenuItem
                icon={<CheckIcon width={15} height={15} style={{ color: GREEN }} />}
                label="Approve"
                onSelect={() => submitReview("approve")}
              />
              <MenuItem
                icon={<AlertIcon width={15} height={15} style={{ color: RED }} />}
                label="Request changes"
                onSelect={() => submitReview("request_changes")}
              />
              <MenuSeparator />
              <MenuItem
                icon={<CodePullRequestIcon width={15} height={15} />}
                label="Comment"
                onSelect={() => submitReview("comment")}
              />
            </Menu>
          </div>

          {/* Quick-send (plain comment) */}
          <button
            type="button"
            aria-label="Comment"
            onClick={sendComment}
            disabled={empty}
            className="flex size-8 items-center justify-center rounded-full bg-btn-solid-bg text-btn-solid-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUpIcon width={16} height={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
