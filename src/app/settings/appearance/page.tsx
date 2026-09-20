"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  SettingsTitle,
  SettingsSection,
  SettingsCard,
  SettingsRow,
} from "../components/primitives";
import { Switch, SegmentedControl, Select } from "../components/controls";

type ThemeChoice = "light" | "dark";

/** Trigger the CSS cross-fade in globals.css by flagging <html> briefly. */
function withThemeFade(apply: () => void) {
  const root = document.documentElement;
  root.setAttribute("data-theme-fade", "");
  apply();
  window.setTimeout(() => root.removeAttribute("data-theme-fade"), 300);
}

/**
 * Appearance settings — theme, density, and typography. The theme control is
 * wired to next-themes and drives the `data-theme` attribute that globals.css
 * reads, so switching here actually re-themes the whole app.
 */
export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">(
    "medium"
  );
  const [monoFont, setMonoFont] = useState<"geist" | "jetbrains" | "system">(
    "geist"
  );

  // next-themes resolves on the client — avoid a hydration mismatch by only
  // reflecting the real value after mount.
  useEffect(() => setMounted(true), []);
  const current: ThemeChoice = (mounted ? theme : "dark") === "light" ? "light" : "dark";

  return (
    <>
      <SettingsTitle>Appearance</SettingsTitle>

      <SettingsSection title="Theme">
        <SettingsCard>
          <SettingsRow
            title="Color theme"
            description="Choose how Claude Code looks. This applies across the whole app."
            control={
              <SegmentedControl<ThemeChoice>
                value={current}
                onChange={(next) => withThemeFade(() => setTheme(next))}
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Text">
        <SettingsCard>
          <SettingsRow
            title="Interface font size"
            description="Adjust the base text size across the app."
            control={
              <SegmentedControl
                value={fontSize}
                onChange={setFontSize}
                options={[
                  { value: "small", label: "Small" },
                  { value: "medium", label: "Medium" },
                  { value: "large", label: "Large" },
                ]}
              />
            }
          />
          <SettingsRow
            title="Code font"
            description="Monospace font used for code blocks and the terminal."
            control={
              <Select
                value={monoFont}
                onChange={setMonoFont}
                minWidth={160}
                options={[
                  { value: "geist", label: "Geist Mono" },
                  { value: "jetbrains", label: "JetBrains Mono" },
                  { value: "system", label: "System monospace" },
                ]}
              />
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Motion">
        <SettingsCard>
          <SettingsRow
            title="Reduce motion"
            description="Minimize animations and transitions throughout the interface."
            control={
              <Switch
                checked={reduceMotion}
                onChange={setReduceMotion}
                label="Reduce motion"
              />
            }
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
