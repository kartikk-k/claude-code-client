/**
 * Git status + diff for a working directory, via `git` on the child_process.
 * All commands are read-only. A non-repo cwd yields empty lists, never a throw.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export type GitFile = {
  path: string;
  added: number;
  removed: number;
  status: string;
};
export type GitStatus = {
  branch?: string;
  ahead?: number;
  behind?: number;
  staged: GitFile[];
  unstaged: GitFile[];
};

/** Run git in `cwd`, returning stdout (empty string on any failure). */
async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec("git", args, {
      cwd,
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return "";
  }
}

/** Parse `git diff --numstat` output into path → {added, removed}. */
function parseNumstat(out: string): Map<string, { added: number; removed: number }> {
  const map = new Map<string, { added: number; removed: number }>();
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const [a, r, ...rest] = line.split("\t");
    const path = rest.join("\t");
    if (!path) continue;
    // "-" marks binary files → count as 0.
    map.set(path, {
      added: a === "-" ? 0 : Number(a) || 0,
      removed: r === "-" ? 0 : Number(r) || 0,
    });
  }
  return map;
}

export async function gitStatus(cwd: string): Promise<GitStatus> {
  // Bail early (empty) if this isn't a work tree.
  const inside = (await git(cwd, ["rev-parse", "--is-inside-work-tree"])).trim();
  if (inside !== "true") return { staged: [], unstaged: [] };

  const result: GitStatus = { staged: [], unstaged: [] };

  const branch = (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  if (branch && branch !== "HEAD") result.branch = branch;

  // ahead/behind vs upstream; tolerate no upstream (empty output).
  const ab = (
    await git(cwd, ["rev-list", "--left-right", "--count", "@{u}...HEAD"])
  ).trim();
  if (ab) {
    const [behind, ahead] = ab.split(/\s+/).map((n) => Number(n) || 0);
    result.behind = behind;
    result.ahead = ahead;
  }

  // Line counts per path for unstaged (working) and staged (index) changes.
  const unstagedNum = parseNumstat(await git(cwd, ["diff", "--numstat"]));
  const stagedNum = parseNumstat(await git(cwd, ["diff", "--cached", "--numstat"]));

  // Porcelain v1: XY <path> (or "orig -> path" for renames). X=index, Y=worktree.
  const porcelain = await git(cwd, ["status", "--porcelain=v1"]);
  for (const line of porcelain.split("\n")) {
    if (!line) continue;
    const x = line[0];
    const y = line[1];
    let path = line.slice(3);
    if (path.includes(" -> ")) path = path.split(" -> ")[1]; // rename target
    if (x && x !== " " && x !== "?") {
      const n = stagedNum.get(path) ?? { added: 0, removed: 0 };
      result.staged.push({ path, status: x, added: n.added, removed: n.removed });
    }
    if ((y && y !== " ") || x === "?") {
      const n = unstagedNum.get(path) ?? { added: 0, removed: 0 };
      // Untracked files show as "??"; surface their status as "?".
      const status = x === "?" ? "?" : y;
      result.unstaged.push({ path, status, added: n.added, removed: n.removed });
    }
  }

  return result;
}

/** Unified diff for a single file. Falls back to the staged diff if empty. */
export async function gitDiff(cwd: string, file: string): Promise<{ diff: string }> {
  let diff = await git(cwd, ["diff", "--", file]);
  if (!diff.trim()) diff = await git(cwd, ["diff", "--cached", "--", file]);
  return { diff };
}
