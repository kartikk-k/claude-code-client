"use client";

/**
 * Bridges the persisted Zustand stores with the durable server config file
 * (`~/.claude-client/config.json`), and gates first paint until localStorage
 * rehydration has finished (so panels don't flash their default sizes before
 * the saved layout loads).
 *
 * - On mount: read `GET /api/config` and merge the durable prefs into the store
 *   (localStorage is the instant cache; the config file is the cross-machine
 *   source of truth, so the server wins for the fields it holds).
 * - On prefs change: debounce-write the prefs blob back via `PUT /api/config`.
 *
 * Mounted once, high in the tree (in providers.tsx), so it applies on every
 * route.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "../app/lib/api";
import { usePrefsStore } from "./prefs.store";

/** The subset of prefs mirrored to the server config file. */
function prefsSnapshot(s: ReturnType<typeof usePrefsStore.getState>) {
  return {
    model: s.model,
    effort: s.effort,
    permission: s.permission,
    general: s.general,
    appearance: s.appearance,
    modelSettings: s.modelSettings,
    permissions: s.permissions,
    about: s.about,
    shortcuts: s.shortcuts,
    pluginsInstalled: s.pluginsInstalled,
    mcpEnabled: s.mcpEnabled,
  };
}

export function StoreHydration({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  // Set true ONLY immediately before applying a server-hydrate, so the resulting
  // store change isn't echoed straight back to the server. Starts false so the
  // very first genuine user edit is written through.
  const skipNextWrite = useRef(false);

  // Wait for zustand's persist to rehydrate from localStorage before painting.
  useEffect(() => {
    // persist exposes hasHydrated(); if already hydrated (SPA nav) resolve now.
    const p = usePrefsStore.persist;
    if (p.hasHydrated()) setReady(true);
    const unsub = p.onFinishHydration(() => setReady(true));
    return unsub;
  }, []);

  // Hydrate durable prefs from the server config once.
  useEffect(() => {
    let cancelled = false;
    api
      .getConfig<{ prefs?: Record<string, unknown> }>()
      .then((cfg) => {
        if (cancelled || !cfg?.prefs) return;
        // Server config wins for the fields it holds; don't echo this back.
        skipNextWrite.current = true;
        usePrefsStore.getState().hydrateFromServer(
          cfg.prefs as Partial<ReturnType<typeof usePrefsStore.getState>>,
        );
      })
      .catch(() => {
        /* server offline or no config yet — localStorage still applies */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced write-through: persist prefs to the server config on change.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = usePrefsStore.subscribe((state) => {
      if (skipNextWrite.current) {
        skipNextWrite.current = false;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        api
          .putConfig({ prefs: prefsSnapshot(state) })
          .catch(() => {
            /* offline — localStorage keeps the value regardless */
          });
      }, 600);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, []);

  // Render children even before `ready` — but hide until hydrated to avoid a
  // layout-size flash. `visibility:hidden` keeps layout measured & fonts warm.
  return (
    <div style={{ visibility: ready ? "visible" : "hidden" }}>{children}</div>
  );
}
