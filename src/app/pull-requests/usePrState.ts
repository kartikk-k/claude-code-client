"use client";

/**
 * usePrState — the page-local "backend" for the Pull requests view.
 *
 * There is no real PR API wired yet, so this hook holds a mutable copy of the
 * seed PRs in React state and exposes the mutations the UI needs so that every
 * button does something real (and persists for the session): posting a comment,
 * submitting a review, merging, re-running / fixing checks, resolving review
 * threads, requesting reviewers, and marking diff files as viewed.
 *
 * All updates are optimistic and immutable (new objects per change) so React
 * re-renders correctly. State is seeded once from `PULL_REQUESTS`.
 */

import { useCallback, useMemo, useState } from "react";
import {
  PULL_REQUESTS,
  type PullRequest,
  type PrActivityItem,
  type PrReviewer,
} from "./data";

/** A monotonic id source for new activity items (SSR-safe: starts at a fixed
 *  base and increments — never Date.now()/Math.random() at module scope). */
let idSeq = 1000;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

export type PrStateApi = {
  /** All PRs (live copy). */
  prs: PullRequest[];
  /** Look up one PR by id. */
  get: (id: string) => PullRequest | undefined;

  /** Append a human comment to a PR's activity feed. */
  addComment: (prId: string, body: string) => void;
  /** Submit a review (approve / request changes / comment). */
  submitReview: (
    prId: string,
    kind: "approve" | "request_changes" | "comment",
    body?: string,
  ) => void;
  /** Merge a PR: flips status to "merged" and records the event. */
  mergePr: (prId: string, method: "merge" | "squash" | "rebase") => void;
  /** Mark a PR ready / draft. */
  setReady: (prId: string, ready: boolean) => void;

  /** Re-run a single check: sets it running, then resolves it to passed. */
  rerunCheck: (prId: string, checkName: string) => void;
  /** Re-run every non-passing check on a PR (the "Fix all" action). */
  rerunAllChecks: (prId: string) => void;

  /** Toggle a review thread's resolved state. */
  toggleThreadResolved: (prId: string, activityId: string) => void;
  /** Reply to a review thread (increments its reply count). */
  replyToThread: (prId: string, activityId: string) => void;

  /** Request a reviewer (adds them in the "pending" state if not present). */
  requestReviewer: (prId: string, handle: string) => void;

  /** Whether a given diff file has been marked "viewed" (per PR). */
  isFileViewed: (prId: string, path: string) => boolean;
  /** Toggle a diff file's "viewed" state. */
  toggleFileViewed: (prId: string, path: string) => void;
  /** How many of a PR's files are marked viewed. */
  viewedCount: (prId: string) => number;

  /** Update the branch when it's "behind" (records an "update branch" event). */
  updateBranch: (prId: string) => void;
};

export function usePrState(): PrStateApi {
  // Deep-ish clone so mutating our copy never touches the shared seed arrays.
  const [prs, setPrs] = useState<PullRequest[]>(() =>
    PULL_REQUESTS.map((p) => ({
      ...p,
      reviewers: p.reviewers.map((r) => ({ ...r })),
      checks: p.checks.map((c) => ({ ...c })),
      activity: p.activity.map((a) => ({ ...a })),
    })),
  );

  // Per-PR set of file paths marked "viewed" in the diff.
  const [viewed, setViewed] = useState<Record<string, Set<string>>>({});

  const patchPr = useCallback(
    (prId: string, fn: (pr: PullRequest) => PullRequest) => {
      setPrs((cur) => cur.map((p) => (p.id === prId ? fn(p) : p)));
    },
    [],
  );

  const get = useCallback(
    (id: string) => prs.find((p) => p.id === id),
    [prs],
  );

  const addComment = useCallback(
    (prId: string, body: string) => {
      const text = body.trim();
      if (!text) return;
      const item: PrActivityItem = {
        id: nextId("comment"),
        kind: "comment",
        actor: "kartikk-k",
        time: "now",
        body: text,
      };
      patchPr(prId, (pr) => ({
        ...pr,
        activity: [...pr.activity, item],
        commentCount: pr.commentCount + 1,
      }));
    },
    [patchPr],
  );

  const submitReview = useCallback(
    (
      prId: string,
      kind: "approve" | "request_changes" | "comment",
      body?: string,
    ) => {
      const verb =
        kind === "approve"
          ? "approved these changes"
          : kind === "request_changes"
            ? "requested changes"
            : "reviewed";
      const item: PrActivityItem = {
        id: nextId("review"),
        kind: "review",
        actor: "kartikk-k",
        time: "now",
        reviewVerb: verb,
        body: body?.trim() || undefined,
      };
      patchPr(prId, (pr) => {
        // Reflect the review on the reviewer chip (add self if not present).
        const state: PrReviewer["state"] =
          kind === "approve"
            ? "approved"
            : kind === "request_changes"
              ? "changes_requested"
              : "commented";
        const reviewers = pr.reviewers.some((r) => r.handle === "kartikk-k")
          ? pr.reviewers.map((r) =>
              r.handle === "kartikk-k" ? { ...r, state } : r,
            )
          : [...pr.reviewers, { handle: "kartikk-k", state } as PrReviewer];
        return { ...pr, reviewers, activity: [...pr.activity, item] };
      });
    },
    [patchPr],
  );

  const setReady = useCallback(
    (prId: string, ready: boolean) => {
      patchPr(prId, (pr) => ({
        ...pr,
        status: ready ? "open" : "draft",
        readyLabel: ready ? "Ready for review" : undefined,
      }));
    },
    [patchPr],
  );

  const mergePr = useCallback(
    (prId: string, method: "merge" | "squash" | "rebase") => {
      const item: PrActivityItem = {
        id: nextId("merge"),
        kind: "review",
        actor: "kartikk-k",
        time: "now",
        reviewVerb:
          method === "squash"
            ? "squashed and merged this pull request"
            : method === "rebase"
              ? "rebased and merged this pull request"
              : "merged this pull request",
      };
      patchPr(prId, (pr) => ({
        ...pr,
        status: "merged",
        mergeable: "clean",
        activity: [...pr.activity, item],
      }));
    },
    [patchPr],
  );

  // Track checks that are mid "re-run" so we can resolve them after a tick.
  const runCheck = useCallback(
    (prId: string, checkName: string) => {
      patchPr(prId, (pr) => ({
        ...pr,
        checks: pr.checks.map((c) =>
          c.name === checkName
            ? { ...c, status: "running" as const, actionLabel: undefined }
            : c,
        ),
      }));
      // Resolve to passed shortly after (feels like CI finishing).
      const settle = () => {
        setPrs((cur) =>
          cur.map((pr) => {
            if (pr.id !== prId) return pr;
            const checks = pr.checks.map((c) =>
              c.name === checkName && c.status === "running"
                ? { ...c, status: "passed" as const, durationLabel: "just now" }
                : c,
            );
            const anyFail = checks.some((c) => c.status === "failed");
            const anyRun = checks.some((c) => c.status === "running");
            const ci = anyFail ? "failing" : anyRun ? "pending" : "passing";
            return { ...pr, checks, ci };
          }),
        );
      };
      if (typeof window !== "undefined") window.setTimeout(settle, 1400);
    },
    [patchPr],
  );

  const rerunCheck = useCallback(
    (prId: string, checkName: string) => runCheck(prId, checkName),
    [runCheck],
  );

  const rerunAllChecks = useCallback(
    (prId: string) => {
      const pr = prs.find((p) => p.id === prId);
      if (!pr) return;
      pr.checks
        .filter((c) => c.status === "failed")
        .forEach((c) => runCheck(prId, c.name));
    },
    [prs, runCheck],
  );

  const toggleThreadResolved = useCallback(
    (prId: string, activityId: string) => {
      patchPr(prId, (pr) => ({
        ...pr,
        activity: pr.activity.map((a) =>
          a.id === activityId ? { ...a, resolved: !a.resolved } : a,
        ),
      }));
    },
    [patchPr],
  );

  const replyToThread = useCallback(
    (prId: string, activityId: string) => {
      patchPr(prId, (pr) => ({
        ...pr,
        activity: pr.activity.map((a) =>
          a.id === activityId
            ? { ...a, replies: (a.replies ?? 0) + 1, resolved: false }
            : a,
        ),
      }));
    },
    [patchPr],
  );

  const requestReviewer = useCallback(
    (prId: string, handle: string) => {
      patchPr(prId, (pr) =>
        pr.reviewers.some((r) => r.handle === handle)
          ? pr
          : {
              ...pr,
              reviewers: [...pr.reviewers, { handle, state: "pending" }],
            },
      );
    },
    [patchPr],
  );

  const updateBranch = useCallback(
    (prId: string) => {
      const item: PrActivityItem = {
        id: nextId("update"),
        kind: "commit",
        actor: "kartikk-k",
        time: "now",
        commit: {
          message: `Merge branch 'main' into head`,
          sha: nextId("m").slice(-7),
          author: "kartikk-k",
          time: "now",
        },
      };
      patchPr(prId, (pr) => ({
        ...pr,
        mergeable: "clean",
        behindBy: 0,
        activity: [...pr.activity, item],
      }));
    },
    [patchPr],
  );

  const isFileViewed = useCallback(
    (prId: string, path: string) => !!viewed[prId]?.has(path),
    [viewed],
  );

  const toggleFileViewed = useCallback((prId: string, path: string) => {
    setViewed((cur) => {
      const set = new Set(cur[prId] ?? []);
      if (set.has(path)) set.delete(path);
      else set.add(path);
      return { ...cur, [prId]: set };
    });
  }, []);

  const viewedCount = useCallback(
    (prId: string) => viewed[prId]?.size ?? 0,
    [viewed],
  );

  return useMemo(
    () => ({
      prs,
      get,
      addComment,
      submitReview,
      mergePr,
      setReady,
      rerunCheck,
      rerunAllChecks,
      toggleThreadResolved,
      replyToThread,
      requestReviewer,
      isFileViewed,
      toggleFileViewed,
      viewedCount,
      updateBranch,
    }),
    [
      prs,
      get,
      addComment,
      submitReview,
      mergePr,
      setReady,
      rerunCheck,
      rerunAllChecks,
      toggleThreadResolved,
      replyToThread,
      requestReviewer,
      isFileViewed,
      toggleFileViewed,
      viewedCount,
      updateBranch,
    ],
  );
}
