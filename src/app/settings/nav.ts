/**
 * Settings navigation model — tailored to THIS project: a local client for the
 * Claude Code CLI. We deliberately drop the reference app's account/billing/
 * voice/pets items (there is no signed-in account here — sessions live on disk)
 * and keep only what a Claude Code client actually configures.
 */
import type { IconName } from "../chat/components/icons";

export type SettingsNavItem = {
  /** URL slug under /settings. */
  slug: string;
  label: string;
  /** Icon glyph key. */
  icon: IconName;
  /** Keywords that also match this pane in the settings search box. */
  keywords?: string[];
};

export type SettingsNavGroup = {
  title: string;
  items: SettingsNavItem[];
};

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    title: "General",
    items: [
      {
        slug: "general",
        label: "General",
        icon: "gear",
        keywords: ["startup", "language", "terminal", "sleep", "menu bar"],
      },
      {
        slug: "appearance",
        label: "Appearance",
        icon: "sparkle",
        keywords: ["theme", "dark", "light", "font", "accent"],
      },
      {
        slug: "keyboard",
        label: "Keyboard shortcuts",
        icon: "grid",
        keywords: ["hotkey", "binding", "shortcut"],
      },
    ],
  },
  {
    title: "Claude Code",
    items: [
      {
        slug: "model",
        label: "Model",
        icon: "brain",
        keywords: ["opus", "sonnet", "haiku", "thinking", "reasoning"],
      },
      {
        slug: "permissions",
        label: "Permissions",
        icon: "shield",
        keywords: ["allow", "tools", "auto", "mode", "bypass", "plan"],
      },
      {
        slug: "plugins",
        label: "Plugins & MCP",
        icon: "plug",
        keywords: ["mcp", "server", "integration", "tools", "marketplace"],
      },
    ],
  },
  {
    title: "About",
    items: [
      {
        slug: "about",
        label: "About",
        icon: "bulb",
        keywords: ["version", "updates", "license", "cli"],
      },
    ],
  },
];

/** Flat list of all panes (for search + validating the active slug). */
export const ALL_SETTINGS_ITEMS: SettingsNavItem[] = SETTINGS_NAV.flatMap(
  (g) => g.items
);
