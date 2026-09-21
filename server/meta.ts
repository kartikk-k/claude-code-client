/**
 * Sidecar metadata store, keyed by sessionId, at ~/.claude-client/meta.json.
 * Claude's own transcripts are read-only for us, so pin/archive/rename state
 * lives here and is merged into session responses by index.ts.
 */
import { join } from "node:path";
import { CLIENT_DIR, readJson, writeJsonAtomic } from "./store.ts";

const META_PATH = join(CLIENT_DIR, "meta.json");

export type SessionMeta = {
  pinned?: boolean;
  archived?: boolean;
  customTitle?: string;
  archivedAt?: number;
};

type MetaFile = Record<string, SessionMeta>;

// In-memory cache; lazily loaded on first access, kept in sync on writes.
let cache: MetaFile | null = null;

/** Read the whole meta map (cached after first load). */
export async function readMeta(): Promise<MetaFile> {
  if (cache) return cache;
  cache = await readJson<MetaFile>(META_PATH, {});
  return cache;
}

/** Get one session's meta (empty object if none). */
export async function getMeta(sessionId: string): Promise<SessionMeta> {
  const all = await readMeta();
  return all[sessionId] ?? {};
}

/** Merge a patch into a session's meta and persist. Returns the merged value. */
export async function setMeta(
  sessionId: string,
  patch: SessionMeta
): Promise<SessionMeta> {
  const all = await readMeta();
  const merged = { ...(all[sessionId] ?? {}), ...patch };
  all[sessionId] = merged;
  cache = all;
  await writeJsonAtomic(META_PATH, all);
  return merged;
}
