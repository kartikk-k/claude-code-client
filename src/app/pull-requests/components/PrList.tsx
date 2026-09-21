"use client";

/**
 * PrList — the middle column of the "Pull requests" triage page. Top-to-bottom
 * it renders three text tabs (All / Reviewing / Authored), a search row (search
 * input + a real Sort/filter menu), and a grouped, collapsible list of PR rows
 * split into "Previously reviewed" (group === "reviewing") and "Authored"
 * (group === "authored") sections.
 *
 * Everything that matters is controlled by props — the tab, the search query,
 * the filter object, and the selected PR id all live in the parent — except the
 * per-section expand/collapse, which is local UI state. The row predicate here
 * mirrors `filterPrs` in `../page` (tab → query → status/ci/author filter) so
 * the parent's keyboard j/k order matches exactly what is on screen; a section
 * with no matching rows hides its heading.
 *
 * Every control does something real: the tabs switch the tab, the search box
 * filters and can be cleared, and the Sort button opens a Menu that sets the
 * status/checks/author filters (and clears them). Colors/radii/spacing come
 * from the app's design tokens (see globals.css) to match PrCard and the
 * plugins page.
 */

import { useMemo, useState } from "react";
import {
  SearchIcon,
  SortIcon,
  ChevronDownIcon,
  XIcon,
  CheckIcon,
} from "../../chat/components/icons";
import {
  Menu,
  MenuItem,
  MenuSeparator,
  MenuGroupLabel,
} from "../../components/ui/Menu";
import type { PullRequest } from "../data";
import type { PrStateApi } from "../usePrState";
import { PrListRow } from "./PrListRow";

/** Join conditional class parts (falsey entries dropped). */
const cx = (...parts: Array<string | false | undefined>) =>
  parts.filter(Boolean).join(" ");

export type PrTab = "all" | "reviewing" | "authored";
/** @deprecated Use {@link PrTab}. Kept as an alias for existing call sites. */
export type PrListTab = PrTab;

/** The list's active filter object. Every field is optional; an empty object
 *  means "no filter". Mirrors the fields `filterPrs` in `../page` reads. */
export type PrFilter = {
  status?: "open" | "merged" | "closed" | "draft";
  ci?: "passing" | "failing" | "pending";
  author?: string;
};

export type PrListProps = {
  /** All pull requests; the list splits them into its two sections. */
  prs: PullRequest[];
  /** Id of the currently-selected PR (highlights its row). */
  activeId: string | undefined;
  /** Called with a PR id when a row is chosen. */
  onSelect: (id: string) => void;
  /** Active tab (controlled). */
  tab: PrTab;
  /** Called when a tab is chosen. */
  onTabChange: (t: PrTab) => void;
  /** Search text (controlled). */
  query: string;
  /** Called when the search text changes. */
  onQueryChange: (q: string) => void;
  /** Active filter (controlled). */
  filter: PrFilter;
  /** Called when the filter changes. */
  onFilterChange: (f: PrFilter) => void;
  /** Ref onto the search input, so the page can focus it on "/". */
  searchRef?: React.Ref<HTMLInputElement>;
  /** Page-local PR state API (mutations + derived counts). */
  state: PrStateApi;
};

const TABS: { id: PrTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "reviewing", label: "Reviewing" },
  { id: "authored", label: "Authored" },
];

const STATUS_OPTIONS: { value: PrFilter["status"]; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "open", label: "Open" },
  { value: "merged", label: "Merged" },
  { value: "draft", label: "Draft" },
];

const CI_OPTIONS: { value: PrFilter["ci"]; label: string }[] = [
  { value: undefined, label: "Any" },
  { value: "passing", label: "Passing" },
  { value: "failing", label: "Failing" },
];

/**
 * Row predicate — mirrors `filterPrs` in `../page` (same fields, same order) so
 * the on-screen list matches the parent's keyboard-nav order. Applies the tab,
 * then the case-insensitive query over title/repo/branch/authorHandle, then the
 * status/ci/author filter.
 */
function matchesPr(
  pr: PullRequest,
  tab: PrTab,
  q: string,
  filter: PrFilter,
): boolean {
  if (tab === "reviewing" && pr.group !== "reviewing") return false;
  if (tab === "authored" && pr.group !== "authored") return false;
  if (q) {
    const hay = `${pr.title} ${pr.repo} ${pr.branch} ${pr.authorHandle}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (filter.status && pr.status !== filter.status) return false;
  if (filter.ci && pr.ci !== filter.ci) return false;
  if (filter.author && pr.authorHandle !== filter.author) return false;
  return true;
}

export function PrList({
  prs,
  activeId,
  onSelect,
  tab,
  onTabChange,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  searchRef,
}: PrListProps) {
  const q = query.trim().toLowerCase();

  const filterActive =
    filter.status !== undefined ||
    filter.ci !== undefined ||
    filter.author !== undefined;

  // Distinct author handles present in the data (for the Author filter group).
  const authors = useMemo(() => {
    const seen = new Set<string>();
    for (const pr of prs) seen.add(pr.authorHandle);
    return Array.from(seen).sort();
  }, [prs]);

  const matches = useMemo(
    () => prs.filter((pr) => matchesPr(pr, tab, q, filter)),
    [prs, tab, q, filter],
  );

  const reviewing = useMemo(
    () => matches.filter((pr) => pr.group === "reviewing"),
    [matches],
  );
  const authored = useMemo(
    () => matches.filter((pr) => pr.group === "authored"),
    [matches],
  );

  const showReviewing = tab !== "authored" && reviewing.length > 0;
  const showAuthored = tab !== "reviewing" && authored.length > 0;

  // Whether the current tab has *any* PRs before query/filter — drives the
  // difference between the "nothing here" and "nothing matches" empty states.
  const tabHasAny = useMemo(
    () =>
      prs.some((pr) => {
        if (tab === "reviewing") return pr.group === "reviewing";
        if (tab === "authored") return pr.group === "authored";
        return true;
      }),
    [prs, tab],
  );

  const setStatus = (status: PrFilter["status"]) =>
    onFilterChange({ ...filter, status });
  const setCi = (ci: PrFilter["ci"]) => onFilterChange({ ...filter, ci });
  const setAuthor = (author: string | undefined) =>
    onFilterChange({ ...filter, author });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Non-scrolling header: tabs + search, centered to the list width. */}
      <div className="shrink-0 px-6 pt-5">
        <div className="mx-auto w-full max-w-[720px]">
          {/* Tabs */}
          <div className="mb-4 flex items-center gap-5">
            {TABS.map((t) => {
              const isActive = t.id === tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTabChange(t.id)}
                  className={cx(
                    "text-sm transition-colors",
                    isActive
                      ? "font-medium text-text-strong"
                      : "text-text-secondary hover:text-text-strong",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="flex h-12 flex-1 items-center gap-2.5 rounded-[14px] border border-control-border bg-control-bg px-4">
              <SearchIcon className="size-4 icon-muted" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search pull requests"
                className="min-w-0 flex-1 bg-transparent text-[14px] leading-5 text-text-primary outline-none placeholder:text-text-faint"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => onQueryChange("")}
                  className="flex size-5 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-nav-active-bg hover:text-text-strong"
                >
                  <XIcon className="size-3.5" />
                </button>
              ) : (
                <span className="pointer-events-none flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border border-control-border px-1.5 font-mono text-[11px] leading-none text-text-faint">
                  /
                </span>
              )}
            </div>

            {/* Sort / filter — a real Menu. A dot on the button reflects an
                active filter. */}
            <Menu
              side="bottom"
              align="end"
              popupClassName="min-w-[220px]"
              trigger={
                <button
                  type="button"
                  aria-label="Sort and filter"
                  className={cx(
                    "relative flex size-12 shrink-0 items-center justify-center rounded-[14px] border border-control-border bg-control-bg transition-colors hover:bg-nav-active-bg/60 hover:text-text-strong",
                    filterActive ? "text-text-strong" : "text-text-secondary",
                  )}
                >
                  <SortIcon className="size-4" />
                  {filterActive ? (
                    <span
                      className="absolute right-2.5 top-2.5 size-2 rounded-full ring-2 ring-control-bg"
                      style={{ backgroundColor: "#3fb950" }}
                    />
                  ) : null}
                </button>
              }
            >
              <MenuGroupLabel>Status</MenuGroupLabel>
              {STATUS_OPTIONS.map((opt) => (
                <MenuItem
                  key={opt.label}
                  label={opt.label}
                  closeOnClick={false}
                  onSelect={() => setStatus(opt.value)}
                  trailing={
                    filter.status === opt.value ? (
                      <CheckIcon className="size-3.5 icon-muted" />
                    ) : undefined
                  }
                />
              ))}

              <MenuSeparator />
              <MenuGroupLabel>Checks</MenuGroupLabel>
              {CI_OPTIONS.map((opt) => (
                <MenuItem
                  key={opt.label}
                  label={opt.label}
                  closeOnClick={false}
                  onSelect={() => setCi(opt.value)}
                  trailing={
                    filter.ci === opt.value ? (
                      <CheckIcon className="size-3.5 icon-muted" />
                    ) : undefined
                  }
                />
              ))}

              <MenuSeparator />
              <MenuGroupLabel>Author</MenuGroupLabel>
              <MenuItem
                label="Anyone"
                closeOnClick={false}
                onSelect={() => setAuthor(undefined)}
                trailing={
                  filter.author === undefined ? (
                    <CheckIcon className="size-3.5 icon-muted" />
                  ) : undefined
                }
              />
              {authors.map((handle) => (
                <MenuItem
                  key={handle}
                  label={handle}
                  closeOnClick={false}
                  onSelect={() => setAuthor(handle)}
                  trailing={
                    filter.author === handle ? (
                      <CheckIcon className="size-3.5 icon-muted" />
                    ) : undefined
                  }
                />
              ))}

              <MenuSeparator />
              <MenuItem
                label="Clear filters"
                accent
                disabled={!filterActive}
                onSelect={() => onFilterChange({})}
              />
            </Menu>
          </div>
        </div>
      </div>

      {/* Scrollable list body. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-16 pt-5">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
          {showReviewing ? (
            <PrGroup
              label="Previously reviewed"
              prs={reviewing}
              activeId={activeId}
              onSelect={onSelect}
            />
          ) : null}
          {showAuthored ? (
            <PrGroup
              label="Authored"
              prs={authored}
              activeId={activeId}
              onSelect={onSelect}
            />
          ) : null}

          {!showReviewing && !showAuthored ? (
            <EmptyState
              tab={tab}
              tabHasAny={tabHasAny}
              searching={q.length > 0}
              filterActive={filterActive}
              onClearFilters={() => onFilterChange({})}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Distinct empty states: nothing in this tab yet, vs. nothing matching the
 *  current search/filter. */
function EmptyState({
  tab,
  tabHasAny,
  searching,
  filterActive,
  onClearFilters,
}: {
  tab: PrTab;
  tabHasAny: boolean;
  searching: boolean;
  filterActive: boolean;
  onClearFilters: () => void;
}) {
  // Nothing to show even before any query/filter → a friendly, tab-specific
  // message.
  if (!tabHasAny && !searching && !filterActive) {
    const message =
      tab === "authored"
        ? "You haven't authored any pull requests."
        : "Nothing to review right now.";
    return (
      <p className="py-12 text-center text-[14px] text-text-faint">{message}</p>
    );
  }

  // Query/filter matched nothing.
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-[14px] text-text-faint">
        No pull requests match your search.
      </p>
      {filterActive ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="rounded-[10px] border border-control-border bg-control-bg px-3 py-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-nav-active-bg hover:text-text-strong"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

/** A collapsible section (disclosure heading + animated list of PR rows). */
function PrGroup({
  label,
  prs,
  activeId,
  onSelect,
}: {
  label: string;
  prs: PullRequest[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 px-1 py-1 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-strong"
      >
        <ChevronDownIcon
          className={cx(
            "size-3.5 icon-muted transition-transform duration-200",
            !expanded && "-rotate-90",
          )}
        />
        {label}
        <span className="text-text-faint">{prs.length}</span>
      </button>

      {/* Animated expand/collapse via grid-template-rows 0fr → 1fr. */}
      <div
        className="grid transition-[grid-template-rows] duration-200"
        style={{
          transitionTimingFunction: "var(--ease-out-quart)",
          gridTemplateRows: expanded ? "1fr" : "0fr",
        }}
        aria-hidden={!expanded}
      >
        <div className="overflow-hidden">
          <div className="mt-1 flex flex-col gap-0.5">
            {prs.map((pr) => (
              <PrListRow
                key={pr.id}
                pr={pr}
                active={pr.id === activeId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
