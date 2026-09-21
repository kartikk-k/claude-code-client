/**
 * Real subscription-usage lookup for the sidebar's "% left" indicator.
 *
 * This is the SAME data Claude Code's interactive `/usage` shows — it is NOT
 * derivable from the headless `claude -p` output (that only reports per-turn
 * token counts, never the rolling rate-limit windows). Instead we call the
 * authenticated OAuth usage endpoint with the token Claude Code already stored
 * when the user logged in:
 *
 *   GET https://api.anthropic.com/api/oauth/usage
 *     Authorization: Bearer <accessToken>
 *     anthropic-beta: oauth-2025-04-20
 *
 * Response shape (fields we use):
 *   { five_hour: { utilization: 61.0, resets_at: "..." },
 *     seven_day: { utilization: 42.0, resets_at: "..." }, ... }
 *
 * `utilization` is "percent used", so "percent left" = 100 - utilization.
 * The sidebar mirrors the five-hour (session) window — the limit users watch
 * turn-to-turn — with the seven-day window returned alongside for the menu.
 *
 * Token source, in order:
 *   1. macOS Keychain: `security find-generic-password -s "Claude Code-credentials"`
 *   2. ~/.claude/.credentials.json (Linux / non-keychain installs)
 * We do not refresh the token here; if it is expired the endpoint 401s and we
 * surface that so the UI can fall back gracefully rather than showing a fake %.
 */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

export type UsageWindow = {
  /** 0–100, percent of the window remaining. */
  pctLeft: number;
  /** ISO timestamp when this window resets, if known. */
  resetsAt: string | null;
};

export type Usage = {
  /** Rolling 5-hour "session" window — the primary limit shown in the sidebar. */
  fiveHour: UsageWindow;
  /** Rolling 7-day window. */
  sevenDay: UsageWindow;
  /** Which window `pctLeft` (the headline number) reflects. */
  primary: "fiveHour" | "sevenDay";
  /** Headline "percent left" the sidebar ring/menu render. */
  pctLeft: number;
  fetchedAt: number;
};

type CredBlob = {
  accessToken?: string;
  claudeAiOauth?: { accessToken?: string };
};

/** Pull the OAuth access token from the macOS Keychain, if present. */
function tokenFromKeychain(): string | null {
  if (process.platform !== "darwin") return null;
  try {
    const res = spawnSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { encoding: "utf8" }
    );
    if (res.status !== 0 || !res.stdout) return null;
    const parsed = JSON.parse(res.stdout.trim()) as CredBlob;
    return parsed.claudeAiOauth?.accessToken ?? parsed.accessToken ?? null;
  } catch {
    return null;
  }
}

/** Fall back to the on-disk credentials file (Linux / headless installs). */
async function tokenFromFile(): Promise<string | null> {
  try {
    const raw = await readFile(
      join(homedir(), ".claude", ".credentials.json"),
      "utf8"
    );
    const parsed = JSON.parse(raw) as CredBlob;
    return parsed.claudeAiOauth?.accessToken ?? parsed.accessToken ?? null;
  } catch {
    return null;
  }
}

async function getToken(): Promise<string | null> {
  return tokenFromKeychain() ?? (await tokenFromFile());
}

type ApiWindow = { utilization?: number; resets_at?: string | null } | null;

function toWindow(w: ApiWindow): UsageWindow {
  const util =
    typeof w?.utilization === "number" ? Math.max(0, Math.min(100, w.utilization)) : 0;
  return { pctLeft: Math.round(100 - util), resetsAt: w?.resets_at ?? null };
}

/**
 * Fetch real usage. Returns null when we cannot determine it (no token, network
 * error, or non-2xx) — callers must treat null as "unknown" and NOT invent a %.
 */
export async function getUsage(): Promise<Usage | null> {
  const token = await getToken();
  if (!token) return null;

  let res: Response;
  try {
    res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "anthropic-version": "2023-06-01",
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let json: { five_hour?: ApiWindow; seven_day?: ApiWindow };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return null;
  }

  const fiveHour = toWindow(json.five_hour ?? null);
  const sevenDay = toWindow(json.seven_day ?? null);
  // Headline reflects whichever window is TIGHTER (least headroom) so the ring
  // warns on the constraint the user will actually hit first.
  const primary = fiveHour.pctLeft <= sevenDay.pctLeft ? "fiveHour" : "sevenDay";

  return {
    fiveHour,
    sevenDay,
    primary,
    pctLeft: primary === "fiveHour" ? fiveHour.pctLeft : sevenDay.pctLeft,
    fetchedAt: Date.now(),
  };
}
