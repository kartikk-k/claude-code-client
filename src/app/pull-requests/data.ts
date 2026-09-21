/**
 * Pull request triage data. This is the seed model for the "Pull requests"
 * page — a GitHub-style PR client that lists PRs the user is reviewing and PRs
 * they authored, with a detail panel for the currently selected PR (checks,
 * reviewers, and a rich GitHub-style activity feed). No network or GitHub API
 * is wired yet; this is pure seed data with enough shape to render both the
 * two-section list and the detail panel.
 *
 * Numeric fields (`additions`, `deletions`, `commentCount`) are real numbers so
 * the UI can format them. Avatars point at real `github.com/<handle>.png`
 * endpoints so the panel shows actual images rather than colored placeholders.
 */

/** High-level state of a pull request. */
export type PrStatus = "open" | "merged" | "closed" | "draft";

/** Rolled-up CI result across all checks, used for the list-row indicator. */
export type CiStatus = "passing" | "failing" | "pending";

/** GitHub avatar URL for a handle. Real endpoint — resolves to the user's
 *  picture (or a generated identicon for unknown handles), no API key needed. */
export function avatarUrl(handle: string): string {
  return `https://github.com/${encodeURIComponent(handle)}.png?size=64`;
}

export type PrCheck = {
  /** Name of the check as reported by the CI provider (e.g. "Vercel"). */
  name: string;
  /** Result of this individual check. */
  status: "passed" | "failed" | "pending" | "running";
  /** Optional inline action for a failed check (e.g. "Fix"). */
  actionLabel?: string;
  /** How long the check took / has been running (e.g. "1m 12s"). */
  durationLabel?: string;
  /** Log output shown when a check row is expanded (mostly for failures). */
  log?: string;
};

export type PrReviewer = {
  /** GitHub handle — also drives the avatar image. */
  handle: string;
  /** Review state; omitted when the reviewer hasn't acted yet. */
  state?: "approved" | "changes_requested" | "pending" | "commented";
};

/** Whether the PR can be merged into its base. */
export type Mergeability = "clean" | "conflicts" | "behind" | "unknown";

/** A single hunk within a file diff. */
export type DiffHunk = {
  /** The `@@ -a,b +c,d @@` header. */
  header: string;
  /** Raw diff lines including the leading +/-/space marker. */
  lines: string[];
};

/** A changed file in the PR's diff. */
export type DiffFile = {
  /** Repo-relative path. */
  path: string;
  /** Change kind, drives the badge. */
  status: "added" | "modified" | "deleted" | "renamed";
  /** Lines added / removed in this file. */
  additions: number;
  deletions: number;
  /** The hunks; empty for binary/collapsed files. */
  hunks: DiffHunk[];
};

/**
 * One entry in the PR's activity timeline. The `kind` selects how it renders:
 *
 * - `commit`      — a single commit row (message + sha).
 * - `commit-group`— a collapsible group of commits ("6 commits").
 * - `opened`      — the "<actor> opened this pull request" event.
 * - `comment`     — a plain human comment (markdown body).
 * - `review`      — a review event (approved / requested changes).
 * - `thread`      — a resolved/unresolved review thread on a file.
 * - `finding`     — a rich bot/agent finding card (markdown body, optional
 *                   "Prompt to fix" block, image grid, and tip callout).
 * - `status`      — a CI status event.
 */
export type PrActivityKind =
  | "commit"
  | "commit-group"
  | "opened"
  | "comment"
  | "review"
  | "thread"
  | "finding"
  | "status";

/** A single commit inside a `commit` row or a `commit-group`. */
export type CommitRef = {
  /** Commit subject line. */
  message: string;
  /** Short sha (7 chars). */
  sha: string;
  /** Author handle (drives the avatar). */
  author: string;
  /** Relative time label. */
  time: string;
};

export type PrActivityItem = {
  /** Stable id for list keys. */
  id: string;
  /** Selects the row renderer (see {@link PrActivityKind}). */
  kind: PrActivityKind;
  /** Handle of the actor who produced the event (drives the avatar). */
  actor: string;
  /** Relative time label (e.g. "2h", "3w"). */
  time: string;

  /** `comment` / `finding`: markdown body (GitHub-flavored). */
  body?: string;
  /** `finding`: bold title shown above the body. */
  title?: string;

  /** `commit`: the single commit's message + sha. */
  commit?: CommitRef;
  /** `commit-group`: the grouped commits (count derived from length). */
  commits?: CommitRef[];

  /** `review`: verb rendered after the actor ("approved these changes"). */
  reviewVerb?: string;

  /** `thread`: file the thread is anchored to. */
  file?: string;
  /** `thread`: whether the thread has been resolved. */
  resolved?: boolean;
  /** `thread`: number of replies on the thread. */
  replies?: number;

  /** `finding`: an optional collapsible "Prompt to fix with AI" block. */
  fixPrompt?: string;
  /** `finding`: number of image placeholders to show in the grid. */
  imageCount?: number;
  /** `finding`: an italic note under the images. */
  note?: string;
  /** `finding`: a highlighted tip callout at the bottom (markdown). */
  tip?: string;
};

export type PullRequest = {
  /** Kebab-case slug, unique per PR; used for routing and selection. */
  id: string;
  /** PR number (the "#123" GitHub identifier). */
  number: number;
  /** PR title as shown on the row and detail header. */
  title: string;
  /** Owner/name of the repository (e.g. "openhackai/app"). */
  repo: string;
  /** GitHub handle of the PR author (drives the author avatar). */
  authorHandle: string;
  /** Head branch the PR is proposing to merge. */
  branch: string;
  /** Base branch the PR targets; defaults to "main". */
  baseBranch: string;
  /** Lines added; a plain number so the UI can format it. */
  additions: number;
  /** Lines removed; a plain number so the UI can format it. */
  deletions: number;
  /** Relative "updated" label (e.g. "2d", "1w", "1mo"). */
  updatedLabel: string;
  /** High-level PR state. */
  status: PrStatus;
  /** Rolled-up CI status for the row indicator. */
  ci: CiStatus;
  /**
   * Which list section + tab this PR belongs to. "reviewing" = the
   * "Previously reviewed" section; "authored" = the "Authored" section.
   */
  group: "reviewing" | "authored";
  /** Number of comments on the PR; a plain number. */
  commentCount: number;
  /** Reviewers requested/acting on the PR; shown in the detail panel. */
  reviewers: PrReviewer[];
  /** Individual CI check rows for the detail panel. */
  checks: PrCheck[];
  /** Timeline of activity for the detail panel. */
  activity: PrActivityItem[];
  /** PR body; when empty/undefined the UI shows "No description provided". */
  description?: string;
  /** Optional readiness badge (e.g. "Ready for review"). */
  readyLabel?: string;
  /** Preferred merge method for the merge button. */
  mergeState?: "merge" | "squash" | "rebase";
  /** Whether the head branch merges cleanly into base. */
  mergeable: Mergeability;
  /** How many commits behind base the branch is (0 = up to date). */
  behindBy: number;
  /** Total commit count on the PR. */
  commitCount: number;
  /** Number of changed files (derived from `diff` when present). */
  filesChanged: number;
  /** The file-by-file diff shown in the Code view. */
  diff: DiffFile[];
};

/* -------------------------------------------------------------------------- */
/* Reusable activity fragments                                                 */
/* -------------------------------------------------------------------------- */

/** Build a standard CI check set: two failing + the usual passing ones. */
function failingChecks(): PrCheck[] {
  return [
    {
      name: "OpenHack Security",
      status: "failed",
      actionLabel: "Fix",
      durationLabel: "48s",
      log: [
        "$ openhack scan --pr",
        "Scanning changed files (14)…",
        "✗ Missing Authorization  app/api/projects/check-slug/route.ts:36",
        "  Any signed-in user can probe slug existence across orgs.",
        "✗ 1 high-severity finding",
        "Error: security gate failed (1 high, 0 critical)",
        "exit code 1",
      ].join("\n"),
    },
    {
      name: "Vercel",
      status: "failed",
      actionLabel: "Fix",
      durationLabel: "2m 04s",
      log: [
        "Running build in Washington, D.C., USA (East)",
        "Installing dependencies…",
        "$ next build",
        "  ▲ Next.js 16.3.3",
        "Failed to compile.",
        "./app/api/projects/check-slug/route.ts:36:12",
        "Type error: 'orgId' is possibly 'undefined'.",
        "Error: Command \"next build\" exited with 1",
      ].join("\n"),
    },
    { name: "Build", status: "passed", durationLabel: "1m 18s" },
    { name: "Greptile Review", status: "passed", durationLabel: "37s" },
    { name: "OpenHack Review", status: "passed", durationLabel: "52s" },
    { name: "Vercel Preview Comments", status: "passed", durationLabel: "6s" },
  ];
}

function passingChecks(): PrCheck[] {
  return [
    { name: "Build", status: "passed", durationLabel: "1m 06s" },
    { name: "Greptile Review", status: "passed", durationLabel: "29s" },
    { name: "OpenHack Review", status: "passed", durationLabel: "44s" },
    { name: "Vercel", status: "passed", durationLabel: "1m 51s" },
    { name: "Vercel Preview Comments", status: "passed", durationLabel: "5s" },
  ];
}

/**
 * Build a small, believable file-by-file diff for a PR. The content is
 * synthesized from the PR's branch/paths so each PR's diff reads differently,
 * and the per-file +/- counts are derived from the hunks so the header totals
 * stay honest.
 */
function buildDiff(seed: {
  slug: string;
  area: string;
}): DiffFile[] {
  const { slug, area } = seed;
  const fnName = slug.replace(/[^a-z]+/gi, " ").trim().split(" ")[0] || "run";
  const files: DiffFile[] = [
    {
      path: `src/${area}/index.ts`,
      status: "modified",
      additions: 0,
      deletions: 0,
      hunks: [
        {
          header: `@@ -12,7 +12,10 @@ export function ${fnName}() {`,
          lines: [
            "   const config = loadConfig();",
            "   const runner = createRunner(config);",
            "-  return runner.start();",
            "+  const session = runner.start();",
            "+  // Guard against a double-start when the tab is re-focused.",
            "+  if (session.active) return session;",
            "+  return session.begin();",
            " }",
          ],
        },
      ],
    },
    {
      path: `src/${area}/${fnName}.test.ts`,
      status: "added",
      additions: 0,
      deletions: 0,
      hunks: [
        {
          header: "@@ -0,0 +1,9 @@",
          lines: [
            `+import { ${fnName} } from "./index";`,
            "+",
            `+describe("${fnName}", () => {`,
            "+  it(\"starts a session exactly once\", () => {",
            `+    const s = ${fnName}();`,
            "+    expect(s.active).toBe(true);",
            "+  });",
            "+});",
            "+",
          ],
        },
      ],
    },
    {
      path: "README.md",
      status: "modified",
      additions: 0,
      deletions: 0,
      hunks: [
        {
          header: "@@ -1,3 +1,4 @@",
          lines: [
            " # Project",
            " ",
            "+Run `bun run scenario` to exercise the new harness.",
            " ",
          ],
        },
      ],
    },
  ];
  // Derive per-file +/- from the hunk markers so totals are truthful.
  for (const f of files) {
    for (const h of f.hunks) {
      for (const ln of h.lines) {
        if (ln.startsWith("+")) f.additions++;
        else if (ln.startsWith("-")) f.deletions++;
      }
    }
  }
  return files;
}

/**
 * Build a realistic GitHub-style activity timeline for a PR. Every PR gets one
 * (this is what makes each PR feel real, not just the first) — commits, the
 * "opened" event, a grouped-commit disclosure, greptile review threads, and a
 * rich agent finding card with a fix prompt, image grid, and a tip callout.
 */
function buildActivity(pr: {
  author: string;
  titleShort: string;
  headSha: string;
  branch: string;
  age: string;
  reviewer: string;
}): PrActivityItem[] {
  // Derive short, PR-unique shas from the head sha so no two PRs show the same
  // commit hashes (a dead giveaway that the data is fake).
  const seed = pr.headSha.replace(/[^0-9a-f]/gi, "").padEnd(7, "0");
  const sha = (i: number) => {
    const base = parseInt(seed.slice(0, 6), 16) + i * 0x1d3f7;
    return (base.toString(16) + seed).slice(0, 7);
  };
  return [
    {
      id: "a-head",
      kind: "commit",
      actor: pr.author,
      time: pr.age,
      commit: {
        message: pr.titleShort,
        sha: pr.headSha,
        author: pr.author,
        time: pr.age,
      },
    },
    {
      id: "a-opened",
      kind: "opened",
      actor: pr.author,
      time: pr.age,
    },
    {
      id: "a-commits",
      kind: "commit-group",
      actor: pr.author,
      time: pr.age,
      commits: [
        {
          message: `feat: ${pr.titleShort.toLowerCase()}`,
          sha: sha(1),
          author: pr.author,
          time: pr.age,
        },
        {
          message: "feat: restyle summary report — group by scenario",
          sha: sha(2),
          author: pr.author,
          time: pr.age,
        },
        {
          message: "feat: restructure fixtures by scenario, add fakes",
          sha: sha(3),
          author: pr.author,
          time: pr.age,
        },
        {
          message: "feat: add run summary and CI-aware reporter",
          sha: sha(4),
          author: pr.author,
          time: pr.age,
        },
        {
          message: "test: expand multi-scenario coverage",
          sha: sha(5),
          author: pr.author,
          time: pr.age,
        },
        {
          message: "fix: resolve registry tier type check",
          sha: sha(6),
          author: pr.author,
          time: pr.age,
        },
      ],
    },
    {
      id: "a-greptile",
      kind: "comment",
      actor: "greptile-apps",
      time: pr.age,
      body: "Greptile reviewed this PR and left **2 suggestions** across the changed files. Overall the structure looks solid — a couple of nits inline.",
    },
    {
      id: "a-thread-1",
      kind: "thread",
      actor: "greptile-apps",
      time: pr.age,
      file: "app-runner.ts",
      resolved: true,
      replies: 1,
    },
    {
      id: "a-thread-2",
      kind: "thread",
      actor: "greptile-apps",
      time: pr.age,
      file: "cli.ts",
      resolved: true,
      replies: 1,
    },
    {
      id: "a-commits-2",
      kind: "commit-group",
      actor: pr.author,
      time: "1w",
      commits: [
        {
          message: "chore: address review feedback",
          sha: sha(7),
          author: pr.author,
          time: "1w",
        },
        {
          message: "docs: note scenario runner usage",
          sha: sha(8),
          author: pr.author,
          time: "1w",
        },
      ],
    },
    {
      id: "a-finding",
      kind: "finding",
      actor: "openhack-agent",
      time: "2d",
      title: "Cross-organization project slug existence oracle",
      body: [
        "**Vulnerability type:** Missing Authorization",
        "",
        "Any signed-in user who knows another organization's UUID can query candidate slugs and infer whether each is already used in that organization. The response exposes only availability and does not return project content.",
        "",
        "**Location:** `app/api/projects/check-slug/route.ts:36`",
        "",
        "**Recommendation:**",
        "",
        "Validate `orgId`, then call `getOrgMembershipById(user.id, orgId)` before performing the slug query. Return **403** when the caller is not a member. Optionally rate-limit probing.",
      ].join("\n"),
      fixPrompt:
        "Fix the missing authorization check in app/api/projects/check-slug/route.ts. Validate orgId and verify org membership before returning slug availability; respond 403 for non-members.",
      imageCount: 5,
      note: "This finding is outside the available PR diff; no inline location was fabricated.",
      tip: "**TIP:** Mention `@openhack-agent` in a PR comment with this finding's link to request a fix or ask a question.",
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Pull requests                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The derived fields (`mergeable`, `behindBy`, `commitCount`, `filesChanged`,
 * `diff`) are filled by `normalize()` below so the seed entries stay compact;
 * `mergeable`/`behindBy` may be provided per-PR to override the defaults.
 */
type SeedPr = Omit<
  PullRequest,
  "commitCount" | "filesChanged" | "diff" | "mergeable" | "behindBy"
> & {
  mergeable?: Mergeability;
  behindBy?: number;
  /** Which source area the synthesized diff lives under. */
  diffArea?: string;
};

/** Fill the derived fields for one seed PR. */
function normalize(pr: SeedPr): PullRequest {
  const diff = buildDiff({
    slug: pr.branch.split("/").pop() ?? pr.id,
    area: pr.diffArea ?? "app",
  });
  const commitCount = pr.activity.reduce(
    (n, a) =>
      n +
      (a.kind === "commit" ? 1 : a.kind === "commit-group" ? a.commits?.length ?? 0 : 0),
    0,
  );
  const mergeable: Mergeability = pr.mergeable ?? (pr.ci === "failing" ? "conflicts" : "clean");
  return {
    ...pr,
    mergeable,
    behindBy: pr.behindBy ?? (mergeable === "behind" ? 12 : 0),
    commitCount,
    filesChanged: diff.length,
    diff,
  };
}

const SEED_PRS: SeedPr[] = [
  {
    id: "e2e-browser-testing",
    number: 128,
    title: "wip: add local multi-scenario browser test harness",
    repo: "openhackai/app",
    authorHandle: "kartikk-k",
    branch: "feat/e2e-browser-testing",
    baseBranch: "main",
    additions: 4452,
    deletions: 618,
    updatedLabel: "2d",
    status: "open",
    ci: "failing",
    group: "reviewing",
    commentCount: 16,
    readyLabel: "Ready for review",
    mergeState: "merge",
    reviewers: [
      { handle: "greptile-apps", state: "commented" },
      { handle: "vercel", state: "pending" },
      { handle: "openhack-agent", state: "commented" },
    ],
    checks: failingChecks(),
    activity: buildActivity({
      author: "kartikk-k",
      titleShort: "add local multi-scenario browser test harness",
      headSha: "551c5b3",
      branch: "feat/e2e-browser-testing",
      age: "3w",
      reviewer: "greptile-apps",
    }),
  },
  {
    id: "vul-demo-test-13",
    number: 13,
    title: "OpenHack original vulnerable baseline — fresh test 13",
    repo: "openbenchbot/vul-demo",
    authorHandle: "openbenchbot",
    branch: "codex/autofix-test-13",
    baseBranch: "main",
    additions: 135,
    deletions: 20,
    updatedLabel: "1w",
    status: "open",
    ci: "passing",
    group: "reviewing",
    commentCount: 3,
    reviewers: [
      { handle: "greptile-apps", state: "approved" },
      { handle: "openhack-agent", state: "commented" },
    ],
    checks: passingChecks(),
    activity: buildActivity({
      author: "openbenchbot",
      titleShort: "restore vulnerable baseline for autofix test 13",
      headSha: "b71e004",
      branch: "codex/autofix-test-13",
      age: "1w",
      reviewer: "greptile-apps",
    }),
  },
  {
    id: "devils2-xss-review-text",
    number: 257,
    title: "fix(security): render review content as text to prevent stored XSS",
    repo: "openbenchbot/devils2",
    authorHandle: "openhack-agent",
    branch: "openhack-autofix/vuln-257-1788625261748",
    baseBranch: "main",
    additions: 2,
    deletions: 5,
    updatedLabel: "1w",
    status: "open",
    ci: "passing",
    group: "reviewing",
    commentCount: 1,
    reviewers: [{ handle: "greptile-apps", state: "approved" }],
    checks: passingChecks(),
    activity: buildActivity({
      author: "openhack-agent",
      titleShort: "render review content as text to prevent stored XSS",
      headSha: "3a9f21c",
      branch: "openhack-autofix/vuln-257",
      age: "1w",
      reviewer: "greptile-apps",
    }),
  },
  {
    id: "devils2-diagnostics-auth",
    number: 263,
    title:
      "fix(security): add authentication to diagnostics endpoint to prevent unauthenticated comm...",
    repo: "openbenchbot/devils2",
    authorHandle: "openhack-agent",
    branch: "openhack-autofix/vuln-263-1788996902582",
    baseBranch: "main",
    additions: 13,
    deletions: 0,
    updatedLabel: "1w",
    status: "open",
    ci: "passing",
    group: "reviewing",
    commentCount: 0,
    reviewers: [{ handle: "greptile-apps", state: "approved" }],
    checks: passingChecks(),
    activity: buildActivity({
      author: "openhack-agent",
      titleShort: "add authentication to diagnostics endpoint",
      headSha: "7c2d88e",
      branch: "openhack-autofix/vuln-263",
      age: "1w",
      reviewer: "greptile-apps",
    }),
  },
  {
    id: "refresh-interface-icons",
    number: 141,
    title: "feat: refresh interface icons",
    repo: "openhackai/app",
    authorHandle: "kartikk-k",
    branch: "feat/custom-icon-system",
    baseBranch: "main",
    additions: 519,
    deletions: 159,
    updatedLabel: "2d",
    status: "open",
    ci: "failing",
    group: "authored",
    commentCount: 4,
    readyLabel: "Ready for review",
    reviewers: [
      { handle: "greptile-apps", state: "commented" },
      { handle: "vercel", state: "pending" },
    ],
    checks: failingChecks(),
    activity: buildActivity({
      author: "kartikk-k",
      titleShort: "refresh interface icons",
      headSha: "e2a1c40",
      branch: "feat/custom-icon-system",
      age: "2d",
      reviewer: "greptile-apps",
    }),
  },
  {
    id: "scan-project-from-assistant",
    number: 137,
    title: "feat: scan projects from the assistant",
    repo: "openhackai/app",
    authorHandle: "kartikk-k",
    branch: "feat/scan-project-from-assistant",
    baseBranch: "main",
    additions: 1817,
    deletions: 109,
    updatedLabel: "2d",
    status: "open",
    ci: "passing",
    group: "authored",
    commentCount: 7,
    readyLabel: "Ready for review",
    reviewers: [
      { handle: "greptile-apps", state: "approved" },
      { handle: "openhack-agent", state: "commented" },
    ],
    checks: passingChecks(),
    activity: buildActivity({
      author: "kartikk-k",
      titleShort: "scan projects from the assistant",
      headSha: "9d4f7b2",
      branch: "feat/scan-project-from-assistant",
      age: "2d",
      reviewer: "greptile-apps",
    }),
  },
  {
    id: "vulnerability-assistant-sidebar-tabs",
    number: 134,
    title: "Move vulnerability assistant into sidebar tabs",
    repo: "openhackai/app",
    authorHandle: "kartikk-k",
    branch: "feat/vulnerability-assistant-sidebar-tabs",
    baseBranch: "main",
    additions: 288,
    deletions: 146,
    updatedLabel: "2d",
    status: "open",
    ci: "passing",
    group: "authored",
    commentCount: 2,
    reviewers: [{ handle: "greptile-apps", state: "approved" }],
    checks: passingChecks(),
    activity: buildActivity({
      author: "kartikk-k",
      titleShort: "move vulnerability assistant into sidebar tabs",
      headSha: "4b8c1a9",
      branch: "feat/vulnerability-assistant-sidebar-tabs",
      age: "2d",
      reviewer: "greptile-apps",
    }),
  },
  {
    id: "enterprise-bug-bounty",
    number: 119,
    title: "feat: add enterprise bug bounty programs",
    repo: "openhackai/app",
    authorHandle: "kartikk-k",
    branch: "feat/enterprise-bug-bounty",
    baseBranch: "main",
    additions: 5067,
    deletions: 81,
    updatedLabel: "1w",
    status: "open",
    ci: "passing",
    group: "authored",
    commentCount: 9,
    mergeable: "behind",
    behindBy: 12,
    readyLabel: "Ready for review",
    reviewers: [
      { handle: "greptile-apps", state: "approved" },
      { handle: "openhack-agent", state: "approved" },
    ],
    checks: passingChecks(),
    activity: buildActivity({
      author: "kartikk-k",
      titleShort: "add enterprise bug bounty programs",
      headSha: "d70e3f5",
      branch: "feat/enterprise-bug-bounty",
      age: "1w",
      reviewer: "greptile-apps",
    }),
  },
  {
    id: "setup-cursor-cloud-env",
    number: 42,
    title: "Set up Cursor Cloud dev environment",
    repo: "kartikk-k/design-tools",
    authorHandle: "kartikk-k",
    branch: "cursor/setup-dev-environment-1718",
    baseBranch: "main",
    additions: 8,
    deletions: 0,
    updatedLabel: "1mo",
    status: "open",
    ci: "passing",
    group: "authored",
    commentCount: 0,
    reviewers: [],
    checks: passingChecks(),
    activity: buildActivity({
      author: "kartikk-k",
      titleShort: "set up Cursor Cloud dev environment",
      headSha: "1a2b3c4",
      branch: "cursor/setup-dev-environment-1718",
      age: "1mo",
      reviewer: "greptile-apps",
    }),
  },
  {
    id: "photoshop-ui-layers-search",
    number: 37,
    title: "Photoshop-style UI with global search and effect layers",
    repo: "kartikk-k/design-tools",
    authorHandle: "kartikk-k",
    branch: "cursor/photoshop-ui-layers-search-7ddc",
    baseBranch: "main",
    additions: 2513,
    deletions: 322,
    updatedLabel: "1mo",
    status: "open",
    ci: "passing",
    group: "authored",
    commentCount: 5,
    reviewers: [{ handle: "greptile-apps", state: "commented" }],
    checks: passingChecks(),
    activity: buildActivity({
      author: "kartikk-k",
      titleShort: "Photoshop-style UI with global search and effect layers",
      headSha: "7ddc0a1",
      branch: "cursor/photoshop-ui-layers-search-7ddc",
      age: "1mo",
      reviewer: "greptile-apps",
    }),
  },
];

/** Fully-formed PRs with derived fields (diff, counts, mergeability) filled. */
export const PULL_REQUESTS: PullRequest[] = SEED_PRS.map(normalize);

/** Id of the PR that is selected by default when the page loads. */
export const SELECTED_PR_ID = "e2e-browser-testing";

export function getPullRequest(id: string): PullRequest | undefined {
  return PULL_REQUESTS.find((pr) => pr.id === id);
}

/** Look up a PR by its number (used for URL deep-linking, e.g. ?pr=128). */
export function getPullRequestByNumber(n: number): PullRequest | undefined {
  return PULL_REQUESTS.find((pr) => pr.number === n);
}
