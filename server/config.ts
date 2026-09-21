/**
 * Persisted app config at ~/.claude-client/config.json (settings + plugins).
 * Opaque blob from the server's POV — the client owns its shape.
 */
import { join } from "node:path";
import { CLIENT_DIR, readJson, writeJsonAtomic } from "./store.ts";

const CONFIG_PATH = join(CLIENT_DIR, "config.json");

/** Read config, returning {} if the file is absent. */
export async function readConfig(): Promise<Record<string, unknown>> {
  return readJson<Record<string, unknown>>(CONFIG_PATH, {});
}

/** Overwrite config with `obj` and return what was saved. */
export async function writeConfig(
  obj: Record<string, unknown>
): Promise<Record<string, unknown>> {
  await writeJsonAtomic(CONFIG_PATH, obj);
  return obj;
}
