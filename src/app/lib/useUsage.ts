"use client";

/**
 * Polls the local server for REAL subscription usage (the same numbers Claude
 * Code's `/usage` shows) and refreshes every minute — independent of whether a
 * chat turn is in flight, so the sidebar ring/menu always reflect the current
 * rolling-window headroom.
 *
 * Returns `pctLeft: null` until the first successful fetch (and whenever usage
 * can't be determined — e.g. no OAuth token / offline). Consumers should render
 * a neutral/loading state for null rather than a made-up percentage.
 */
import { useEffect, useState } from "react";
import { api, type Usage } from "./api";

const POLL_MS = 60_000;

export function useUsage(): {
  usage: Usage | null;
  /** Convenience: headline percent left, or null when unknown. */
  pctLeft: number | null;
} {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const u = await api.usage();
        if (!cancelled) setUsage(u);
      } catch {
        // Leave the last known value in place on a transient failure; the next
        // tick will retry. Don't clobber a good reading with null on a blip.
      }
    };

    tick(); // fetch immediately on mount
    const id = setInterval(tick, POLL_MS);
    // Re-sync when the tab regains focus so a backgrounded window isn't stale.
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { usage, pctLeft: usage?.pctLeft ?? null };
}
