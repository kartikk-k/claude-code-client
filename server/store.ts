/**
 * Shared helpers for the ~/.claude-client sidecar store (meta + config).
 * Everything lives in a single app dir separate from Claude's own ~/.claude.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";

export const CLIENT_DIR = join(homedir(), ".claude-client");

/** Ensure ~/.claude-client exists (idempotent). */
export async function ensureDir(dir: string = CLIENT_DIR): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Read + parse a JSON file, returning `fallback` if missing/corrupt. */
export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Atomic-ish write: write a temp sibling then rename over the target. */
export async function writeJsonAtomic(path: string, obj: unknown): Promise<void> {
  await ensureDir();
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
  await rename(tmp, path);
}
