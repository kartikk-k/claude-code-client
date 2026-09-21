"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SELECTED_PR_ID, type PullRequest } from "./data";
import { PrList, type PrTab, type PrFilter } from "./components/PrList";
import { PrDetail } from "./components/PrDetail";
import { usePrState } from "./usePrState";

/** Detail-panel width bounds + default (px). */
const MIN_WIDTH = 380;
const MAX_WIDTH = 760;
const DEFAULT_WIDTH = 460;
/** Keyboard resize step (px per arrow press). */
const RESIZE_STEP = 24;

/**
 * Pull requests — a two-pane triage view with a working, developer-grade UX:
 *
 * - The active PR is reflected in the URL (`?pr=<number>`), so it is
 *   refresh/back/forward/shareable.
 * - Keyboard navigation: `j`/`k` move between PRs, `Enter` focuses the detail
 *   panel, `/` focuses search, `Escape` clears it.
 * - The detail panel is drag- AND keyboard-resizable (focus the handle, then
 *   arrow keys).
 * - All mutations (comment, review, merge, re-run checks, resolve threads, mark
 *   files viewed, request review) run through `usePrState`, so every control
 *   does something real for the session.
 */
function PullRequestsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = usePrState();
  const prs = state.prs;

  // --- selection, synced to the URL (?pr=<number>) ---
  const urlNumber = Number(searchParams.get("pr"));
  const activeId = useMemo(() => {
    const byNumber = Number.isFinite(urlNumber)
      ? prs.find((p) => p.number === urlNumber)
      : undefined;
    return byNumber?.id ?? SELECTED_PR_ID;
  }, [urlNumber, prs]);

  const activePr = useMemo(
    () => prs.find((p) => p.id === activeId) ?? null,
    [prs, activeId],
  );

  const select = useCallback(
    (id: string) => {
      const pr = prs.find((p) => p.id === id);
      if (!pr) return;
      // Push the PR number into the URL (shallow — same route).
      router.replace(`/pull-requests?pr=${pr.number}`);
    },
    [prs, router],
  );

  // --- list controls ---
  const [tab, setTab] = useState<PrTab>("all");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PrFilter>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // The list order actually shown (after tab + query + filter), so keyboard
  // j/k can walk it in visual order. PrList computes the same predicate.
  const visibleList = useMemo(
    () => filterPrs(prs, tab, query, filter),
    [prs, tab, query, filter],
  );

  // --- keyboard navigation ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);

      // "/" focuses search from anywhere (unless already typing).
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing) {
        if (e.key === "Escape" && el === searchRef.current) {
          setQuery("");
          searchRef.current?.blur();
        }
        return;
      }
      // j / ↓ move down, k / ↑ move up through the visible list.
      const isDown = e.key === "j" || e.key === "ArrowDown";
      const isUp = e.key === "k" || e.key === "ArrowUp";
      if (isDown || isUp) {
        if (visibleList.length === 0) return;
        e.preventDefault();
        const idx = visibleList.findIndex((p) => p.id === activeId);
        const nextIdx = isDown
          ? Math.min(visibleList.length - 1, (idx < 0 ? -1 : idx) + 1)
          : Math.max(0, (idx < 0 ? 1 : idx) - 1);
        select(visibleList[nextIdx].id);
        return;
      }
      // Enter focuses the detail panel for keyboard scrolling.
      if (e.key === "Enter") {
        detailRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleList, activeId, select]);

  // --- resizable detail panel (handle on its LEFT edge) ---
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const clamp = (w: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));

  const onPointerMove = useCallback((e: PointerEvent) => {
    const s = dragState.current;
    if (!s) return;
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

  const onHandleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setWidth((w) => clamp(w + RESIZE_STEP));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setWidth((w) => clamp(w - RESIZE_STEP));
    }
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {/* List column — its own vertical scroll. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <PrList
          prs={prs}
          activeId={activeId}
          onSelect={select}
          tab={tab}
          onTabChange={setTab}
          query={query}
          onQueryChange={setQuery}
          filter={filter}
          onFilterChange={setFilter}
          searchRef={searchRef}
          state={state}
        />
      </div>

      {/* Detail panel — drag/keyboard-resizable, its own scroll. */}
      <aside
        className="relative hidden shrink-0 border-l border-panel-border bg-app-bg lg:block"
        style={{ width }}
      >
        <button
          type="button"
          aria-label="Resize panel (use arrow keys)"
          onPointerDown={onHandleDown}
          onKeyDown={onHandleKey}
          className="group absolute inset-y-0 -left-1 z-10 flex w-2 cursor-col-resize touch-none items-center justify-center outline-none"
        >
          <span
            className={
              dragging
                ? "h-full w-px bg-[var(--primary)]"
                : "h-full w-px bg-transparent transition-colors duration-150 ease-out group-hover:bg-[var(--primary)] group-focus-visible:bg-[var(--primary)]"
            }
          />
        </button>
        <PrDetail pr={activePr} state={state} scrollRef={detailRef} />
      </aside>
    </div>
  );
}

/**
 * The shared list predicate — used by the page (for keyboard nav order) and
 * mirrored by PrList for rendering. Applies tab, query, and the filter object.
 */
export function filterPrs(
  prs: PullRequest[],
  tab: PrTab,
  query: string,
  filter: PrFilter,
): PullRequest[] {
  const q = query.trim().toLowerCase();
  return prs.filter((pr) => {
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
  });
}

/** A lightweight skeleton shown while the client shell suspends on
 *  `useSearchParams` — avoids a blank flash on first paint. */
function PrPageSkeleton() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="px-6 pt-5">
          <div className="mx-auto w-full max-w-[720px]">
            <div className="mb-4 flex gap-5">
              <div className="h-4 w-8 rounded bg-bubble-bg" />
              <div className="h-4 w-16 rounded bg-bubble-bg" />
              <div className="h-4 w-16 rounded bg-bubble-bg" />
            </div>
            <div className="h-12 rounded-[14px] bg-control-bg" />
            <div className="mt-6 flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-1 py-2.5">
                  <div className="size-6 shrink-0 rounded-full bg-bubble-bg" />
                  <div className="flex-1">
                    <div className="h-3.5 w-2/3 rounded bg-bubble-bg" />
                    <div className="mt-2 h-3 w-1/3 rounded bg-bubble-bg/60" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <aside className="hidden w-[460px] shrink-0 border-l border-panel-border lg:block" />
    </div>
  );
}

export default function PullRequestsPage() {
  return (
    <Suspense fallback={<PrPageSkeleton />}>
      <PullRequestsInner />
    </Suspense>
  );
}
