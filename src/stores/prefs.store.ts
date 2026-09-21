"use client";

/**
 * Global preferences store — the durable, app-wide settings that are the same
 * regardless of which chat is open: the default model / effort / permission the
 * composer starts with, every Settings pane's toggles, plugin install + MCP
 * enable state, and keyboard shortcuts.
 *
 * Persisted to localStorage (instant) via zustand's `persist`; a server config
 * file (`~/.claude-client/config.json`, wired in a later phase) is the durable
 * cross-machine source that hydrates and write-throughs. Until that endpoint
 * exists, localStorage alone already makes every setting survive reloads.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EffortLevel } from "../app/components/composer/EffortMenu";
import type { PermissionValue } from "../app/components/composer/Popovers";

/** Model ids match the composer's MODEL_OPTIONS + the CLI `--model` values. */
export type ModelId = "opus" | "sonnet" | "haiku";

export type GeneralSettings = {
  projectFolder: string;
  openDest: "terminal" | "editor" | "finder";
  terminalLoc: "bottom" | "right";
  language: "auto" | "en" | "es" | "fr" | "de";
  menuBar: boolean;
  preventSleep: boolean;
  confirmDangerous: boolean;
};

export type AppearanceSettings = {
  reduceMotion: boolean;
  fontSize: "small" | "medium" | "large";
  monoFont: "geist" | "jetbrains" | "system";
};

export type ModelSettings = {
  defaultModel: ModelId;
  defaultEffort: EffortLevel;
  extendedThinking: boolean;
  showThinking: boolean;
  autoCompact: boolean;
};

export type PermissionsSettings = {
  mode: PermissionValue;
  askOutsideWorkspace: boolean;
  allowNetwork: boolean;
  allowed: string[];
  denied: string[];
};

export type AboutSettings = {
  autoUpdate: boolean;
  beta: boolean;
};

/** A single editable keyboard shortcut. `keys === null` means unassigned. */
export type Shortcut = {
  id: string;
  label: string;
  description: string;
  keys: string | null;
};

type PrefsState = {
  /** Per-message composer selections (seeded from ModelSettings defaults). */
  model: ModelId;
  effort: EffortLevel;
  permission: PermissionValue;

  general: GeneralSettings;
  appearance: AppearanceSettings;
  modelSettings: ModelSettings;
  permissions: PermissionsSettings;
  about: AboutSettings;
  shortcuts: Shortcut[];

  /** Plugin (MCP) install + enable state, keyed by plugin id from the catalog. */
  pluginsInstalled: Record<string, boolean>;
  mcpEnabled: Record<string, boolean>;

  // --- actions ---
  setModel: (m: ModelId) => void;
  setEffort: (e: EffortLevel) => void;
  setPermission: (p: PermissionValue) => void;
  patchGeneral: (p: Partial<GeneralSettings>) => void;
  patchAppearance: (p: Partial<AppearanceSettings>) => void;
  patchModelSettings: (p: Partial<ModelSettings>) => void;
  patchPermissions: (p: Partial<PermissionsSettings>) => void;
  patchAbout: (p: Partial<AboutSettings>) => void;
  setShortcuts: (s: Shortcut[]) => void;
  setPluginInstalled: (id: string, installed: boolean) => void;
  setMcpEnabled: (id: string, enabled: boolean) => void;
  /** Replace the whole prefs blob (used when hydrating from the server config). */
  hydrateFromServer: (partial: Partial<PrefsState>) => void;
};

export const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: "new-chat", label: "New chat", description: "Start a new chat", keys: "⌘N" },
  {
    id: "new-temp",
    label: "New temporary chat",
    description: "Start a chat that won't appear in history",
    keys: "⇧⌘N",
  },
  {
    id: "toggle-sidebar",
    label: "Toggle sidebar",
    description: "Show or hide the sessions sidebar",
    keys: "⌘B",
  },
  { id: "search", label: "Search", description: "Search sessions and projects", keys: "⌘K" },
  { id: "send", label: "Send message", description: "Send the composed message", keys: "⌘↵" },
  { id: "stop", label: "Stop generation", description: "Interrupt the current response", keys: "Esc" },
  {
    id: "toggle-terminal",
    label: "Toggle bottom panel",
    description: "Show or hide the bottom terminal panel",
    keys: "⌘J",
  },
  {
    id: "toggle-review",
    label: "Toggle changes panel",
    description: "Open the review / changes panel",
    keys: "⇧⌘R",
  },
  {
    id: "cycle-permission",
    label: "Cycle permission mode",
    description: "Switch between plan, approve, and full access",
    keys: "⇧Tab",
  },
  { id: "settings", label: "Open settings", description: "Open the settings window", keys: "⌘," },
  {
    id: "new-window",
    label: "Open in new window",
    description: "Open the current chat in a new window",
    keys: null,
  },
];

const DEFAULT_GENERAL: GeneralSettings = {
  projectFolder: "~/Documents/ClaudeCode",
  openDest: "terminal",
  terminalLoc: "bottom",
  language: "auto",
  menuBar: false,
  preventSleep: true,
  confirmDangerous: true,
};

const DEFAULT_APPEARANCE: AppearanceSettings = {
  reduceMotion: false,
  fontSize: "medium",
  monoFont: "geist",
};

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  defaultModel: "sonnet",
  defaultEffort: "Medium",
  extendedThinking: true,
  showThinking: true,
  autoCompact: true,
};

const DEFAULT_PERMISSIONS: PermissionsSettings = {
  mode: "plan",
  askOutsideWorkspace: true,
  allowNetwork: false,
  allowed: ["Read", "Edit", "Bash(git *)"],
  denied: ["Bash(rm -rf *)"],
};

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      model: DEFAULT_MODEL_SETTINGS.defaultModel,
      effort: DEFAULT_MODEL_SETTINGS.defaultEffort,
      permission: DEFAULT_PERMISSIONS.mode,

      general: DEFAULT_GENERAL,
      appearance: DEFAULT_APPEARANCE,
      modelSettings: DEFAULT_MODEL_SETTINGS,
      permissions: DEFAULT_PERMISSIONS,
      about: { autoUpdate: true, beta: false },
      shortcuts: DEFAULT_SHORTCUTS,

      pluginsInstalled: {},
      mcpEnabled: {},

      setModel: (model) => set({ model }),
      setEffort: (effort) => set({ effort }),
      setPermission: (permission) => set({ permission }),
      patchGeneral: (p) => set((s) => ({ general: { ...s.general, ...p } })),
      patchAppearance: (p) =>
        set((s) => ({ appearance: { ...s.appearance, ...p } })),
      patchModelSettings: (p) =>
        set((s) => ({ modelSettings: { ...s.modelSettings, ...p } })),
      patchPermissions: (p) =>
        set((s) => ({ permissions: { ...s.permissions, ...p } })),
      patchAbout: (p) => set((s) => ({ about: { ...s.about, ...p } })),
      setShortcuts: (shortcuts) => set({ shortcuts }),
      setPluginInstalled: (id, installed) =>
        set((s) => ({
          pluginsInstalled: { ...s.pluginsInstalled, [id]: installed },
        })),
      setMcpEnabled: (id, enabled) =>
        set((s) => ({ mcpEnabled: { ...s.mcpEnabled, [id]: enabled } })),
      hydrateFromServer: (partial) => set(partial),
    }),
    {
      name: "claude-client:prefs",
      version: 1,
    },
  ),
);
