/**
 * Lazy file-tree + file-content reads under a working directory.
 * Every relative path is resolved and confined to `cwd` (no traversal).
 */
import { join, resolve, sep } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

export type FileEntry = {
  name: string;
  path: string; // relative to cwd
  type: "file" | "dir";
  size?: number;
};

// Cap file reads to keep responses bounded.
const MAX_BYTES = 200 * 1024;

/** Resolve `relPath` under `cwd`, throwing if it escapes the root. */
function safeResolve(cwd: string, relPath: string): string {
  const root = resolve(cwd);
  const full = resolve(root, relPath || ".");
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error("path escapes cwd");
  }
  return full;
}

/** List one directory level, dirs first then files, both alphabetical. */
export async function listDir(cwd: string, relPath = ""): Promise<FileEntry[]> {
  const full = safeResolve(cwd, relPath);
  const dirents = await readdir(full, { withFileTypes: true });
  const entries: FileEntry[] = [];
  for (const d of dirents) {
    const isDir = d.isDirectory();
    const rel = join(relPath, d.name);
    let size: number | undefined;
    if (!isDir) {
      try {
        size = (await stat(join(full, d.name))).size;
      } catch {
        /* ignore unreadable entry stat */
      }
    }
    entries.push({
      name: d.name,
      path: rel,
      type: isDir ? "dir" : "file",
      size,
    });
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

/** Read a file's content, capped at MAX_BYTES with a `truncated` flag. */
export async function readFileContent(
  cwd: string,
  relPath: string
): Promise<{ content: string; truncated: boolean }> {
  const full = safeResolve(cwd, relPath);
  const buf = await readFile(full);
  const truncated = buf.length > MAX_BYTES;
  const slice = truncated ? buf.subarray(0, MAX_BYTES) : buf;
  return { content: slice.toString("utf8"), truncated };
}
