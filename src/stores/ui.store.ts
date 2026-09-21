"use client";

/**
 * UI layout store — every piece of "where are the panels and how big" state, so
 * the app resumes exactly as you left it across route changes and reloads (the
 * whole point: it behaves like a native desktop client, not a page that resets).
 *
 * Two tiers:
 *  - GLOBAL chrome: left sidebar collapsed, right/bottom panel open + full-width.
 *  - PER-CHAT layout: right-panel width + active tab, bottom-panel height, and
 *    the composer draft + attachments — keyed by sessionId so each conversation
 *    remembers its own workspace. `getLayout(id)` returns sensible defaults when
 *    a chat has no saved layout yet.
 *
 * Transient drag state (dragging flag, pointer anchor) stays LOCAL in the panel
 * components; only the committed size is written here on pointer-up.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Openable right-panel tabs. `none` = the tab-list empty state. */
export type RightTab =
  | "none"
  | "review"
  | "terminal"
  | "browser"
  | "files"
  | "sidechat"
  | "preview";

/** A composer image attachment, persisted as a data/URL string + name. */
export type DraftAttachment = { id: string; url: string; name: string };

/**
 * A single open right-panel tab. `kind` is the tab type (review/terminal/…);
 * `url` is only meaningful for browser tabs (the current page). Preview tabs
 * carry no persisted url — the previewed file lives in transient panel state.
 */
export type OpenTab = {
  id: string;
  kind: Exclude<RightTab, "none">;
  url?: string;
};

/** One open terminal in the bottom panel (stable id → persistent PTY session). */
export type BottomTerm = { id: string };

/** Everything a single chat remembers about its workspace. */
export type ChatLayout = {
  rightWidth: number;
  /** @deprecated Kept for back-compat with v1 layouts; superseded by openTabs. */
  rightTab: RightTab;
  /** The set of open right-panel tabs (multi-tab model). */
  openTabs: OpenTab[];
  /** The active tab's id, or null when the empty tab-list state is shown. */
  activeTabId: string | null;
  bottomHeight: number;
  /** Open bottom-panel terminals (multi-tab). Stable ids keep PTYs alive. */
  bottomTerminals: BottomTerm[];
  bottomActiveId: string | null;
  draft: string;
  attachments: DraftAttachment[];
};

export const RIGHT_MIN_WIDTH = 320;
export const RIGHT_MAX_WIDTH = 640;
export const RIGHT_DEFAULT_WIDTH = 420;
export const BOTTOM_MIN_HEIGHT = 140;
export const BOTTOM_MAX_HEIGHT = 560;
export const BOTTOM_DEFAULT_HEIGHT = 260;

// Left sidebar width — adjustable like the right panel, but capped a bit
// narrower (it holds a fixed nav + session list, so it needs less room).
export const LEFT_MIN_WIDTH = 220;
export const LEFT_MAX_WIDTH = 400;
export const LEFT_DEFAULT_WIDTH = 272;

export const DEFAULT_CHAT_LAYOUT: ChatLayout = {
  rightWidth: RIGHT_DEFAULT_WIDTH,
  rightTab: "none",
  openTabs: [],
  activeTabId: null,
  bottomHeight: BOTTOM_DEFAULT_HEIGHT,
  bottomTerminals: [],
  bottomActiveId: null,
  draft: "",
  attachments: [],
};

/** Key used for the "no active chat yet" workspace. */
export const NO_CHAT_KEY = "__none__";

type UiState = {
  sidebarCollapsed: boolean;
  /** Left sidebar width (px) — adjustable, persisted globally. */
  sidebarWidth: number;
  rightPanelOpen: boolean;
  rightPanelFull: boolean;
  bottomPanelOpen: boolean;
  /** Expanded project folders in the sidebar, keyed by projectId. */
  expanded: Record<string, boolean>;
  /** Per-chat workspace layout, keyed by sessionId (or NO_CHAT_KEY). */
  chatLayout: Record<string, ChatLayout>;

  // --- global chrome actions ---
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setSidebarWidth: (w: number) => void;
  toggleRightPanel: () => void;
  setRightPanelOpen: (v: boolean) => void;
  setRightPanelFull: (v: boolean) => void;
  toggleBottomPanel: () => void;
  setBottomPanelOpen: (v: boolean) => void;
  toggleProjectExpanded: (projectId: string) => void;
  setProjectExpanded: (projectId: string, v: boolean) => void;

  // --- per-chat layout ---
  getLayout: (sessionId: string | null | undefined) => ChatLayout;
  patchLayout: (
    sessionId: string | null | undefined,
    patch: Partial<ChatLayout>,
  ) => void;
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      sidebarWidth: LEFT_DEFAULT_WIDTH,
      rightPanelOpen: true,
      rightPanelFull: false,
      bottomPanelOpen: false,
      expanded: {},
      chatLayout: {},

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setSidebarWidth: (w) =>
        set({ sidebarWidth: clamp(w, LEFT_MIN_WIDTH, LEFT_MAX_WIDTH) }),
      toggleRightPanel: () =>
        set((s) => ({
          rightPanelOpen: !s.rightPanelOpen,
          // Leaving the panel exits full-width, matching the old shell coupling.
          rightPanelFull: s.rightPanelOpen ? false : s.rightPanelFull,
        })),
      setRightPanelOpen: (rightPanelOpen) =>
        set((s) => ({
          rightPanelOpen,
          rightPanelFull: rightPanelOpen ? s.rightPanelFull : false,
        })),
      setRightPanelFull: (rightPanelFull) => set({ rightPanelFull }),
      toggleBottomPanel: () =>
        set((s) => ({ bottomPanelOpen: !s.bottomPanelOpen })),
      setBottomPanelOpen: (bottomPanelOpen) => set({ bottomPanelOpen }),
      toggleProjectExpanded: (projectId) =>
        set((s) => ({
          expanded: { ...s.expanded, [projectId]: !s.expanded[projectId] },
        })),
      setProjectExpanded: (projectId, v) =>
        set((s) => ({ expanded: { ...s.expanded, [projectId]: v } })),

      getLayout: (sessionId) => {
        const key = sessionId || NO_CHAT_KEY;
        // Return the STABLE stored reference (or the shared default) — never a
        // freshly-built object, or Zustand's snapshot cache would see a new
        // value every render and loop. Older layouts are normalized to include
        // all fields by the persist `migrate` step (v2 → v3), so reads here can
        // stay pure.
        return get().chatLayout[key] ?? DEFAULT_CHAT_LAYOUT;
      },
      patchLayout: (sessionId, patch) => {
        const key = sessionId || NO_CHAT_KEY;
        set((s) => {
          const prev = s.chatLayout[key] ?? DEFAULT_CHAT_LAYOUT;
          const next: ChatLayout = { ...prev, ...patch };
          // Keep numeric sizes in range.
          next.rightWidth = clamp(
            next.rightWidth,
            RIGHT_MIN_WIDTH,
            RIGHT_MAX_WIDTH,
          );
          next.bottomHeight = clamp(
            next.bottomHeight,
            BOTTOM_MIN_HEIGHT,
            BOTTOM_MAX_HEIGHT,
          );
          return { chatLayout: { ...s.chatLayout, [key]: next } };
        });
      },
    }),
    {
      name: "claude-client:ui",
      version: 3,
      // Normalize persisted layouts so every read returns a fully-populated,
      // stable object (a partial layout would force getLayout to rebuild it,
      // which breaks Zustand's snapshot caching).
      //   v1 → v2: single `rightTab` → the multi-tab `openTabs`/`activeTabId`.
      //   v2 → v3: backfill `bottomTerminals`/`bottomActiveId` (+ any new field).
      migrate: (persisted, version) => {
        const state = persisted as {
          chatLayout?: Record<string, ChatLayout>;
          sidebarWidth?: number;
        };
        if (!state || typeof state !== "object") return persisted as UiState;
        if (state.chatLayout) {
          const migrated: Record<string, ChatLayout> = {};
          for (const [key, raw] of Object.entries(state.chatLayout)) {
            const layout = raw as Partial<ChatLayout> & { rightTab?: RightTab };
            let openTabs = Array.isArray(layout.openTabs)
              ? layout.openTabs
              : undefined;
            let activeTabId = layout.activeTabId;
            if (!openTabs && version < 2) {
              const prevTab = layout.rightTab ?? "none";
              openTabs =
                prevTab && prevTab !== "none" && prevTab !== "preview"
                  ? [{ id: `${prevTab}-migrated`, kind: prevTab }]
                  : [];
              activeTabId = openTabs[0]?.id ?? null;
            }
            // Fill every field from defaults so the shape is always complete.
            migrated[key] = {
              ...DEFAULT_CHAT_LAYOUT,
              ...layout,
              openTabs: openTabs ?? DEFAULT_CHAT_LAYOUT.openTabs,
              activeTabId: activeTabId ?? null,
            };
          }
          state.chatLayout = migrated;
        }
        return state as UiState;
      },
    },
  ),
);
