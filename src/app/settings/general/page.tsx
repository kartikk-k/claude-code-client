"use client";

import {
  SettingsTitle,
  SettingsSection,
  SettingsCard,
  SettingsRow,
  RowValue,
  RowButton,
} from "../components/primitives";
import { Switch, SegmentedControl, Select } from "../components/controls";
import { TerminalIcon } from "../../chat/components/icons";
import { usePrefsStore } from "@/stores";

/**
 * General settings — scoped to a local Claude Code CLI client. We keep only the
 * items that make sense here (working directory, terminal, language, startup)
 * and drop the reference app's account/voice/pets rows.
 */
export default function GeneralSettings() {
  const general = usePrefsStore((s) => s.general);
  const patchGeneral = usePrefsStore((s) => s.patchGeneral);
  const { menuBar, preventSleep, confirmDangerous, openDest, language, terminalLoc } =
    general;

  return (
    <>
      <SettingsTitle>General</SettingsTitle>

      <SettingsSection title="Workspace">
        <SettingsCard>
          <SettingsRow
            title="Default project folder"
            description="Where sessions started outside a project store their data by default."
            control={
              <div className="flex items-center gap-2">
                <RowValue>~/Documents/ClaudeCode</RowValue>
                <RowButton>Change</RowButton>
              </div>
            }
          />
          <SettingsRow
            title="Default open destination"
            description="Where files and folders open by default."
            control={
              <Select
                value={openDest}
                onChange={(openDest) => patchGeneral({ openDest })}
                leadingIcon={<TerminalIcon className="size-4 icon-muted" />}
                options={[
                  {
                    value: "terminal",
                    label: "Terminal",
                    icon: <TerminalIcon className="size-4 icon-muted" />,
                  },
                  { value: "editor", label: "Editor" },
                  { value: "finder", label: "Finder" },
                ]}
              />
            }
          />
          <SettingsRow
            title="Default terminal location"
            description="Where the terminal panel opens inside the app."
            control={
              <SegmentedControl
                value={terminalLoc}
                onChange={(terminalLoc) => patchGeneral({ terminalLoc })}
                options={[
                  { value: "bottom", label: "Bottom" },
                  { value: "right", label: "Right" },
                ]}
              />
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Application">
        <SettingsCard>
          <SettingsRow
            title="Language"
            description="Language for the app UI."
            control={
              <Select
                value={language}
                onChange={(language) => patchGeneral({ language })}
                minWidth={160}
                options={[
                  { value: "auto", label: "Auto detect" },
                  { value: "en", label: "English" },
                  { value: "es", label: "Español" },
                  { value: "fr", label: "Français" },
                  { value: "de", label: "Deutsch" },
                ]}
              />
            }
          />
          <SettingsRow
            title="Show in menu bar"
            description="Keep Claude Code in the macOS menu bar when the main window is closed."
            control={<Switch checked={menuBar} onChange={(menuBar) => patchGeneral({ menuBar })} label="Show in menu bar" />}
          />
          <SettingsRow
            title="Prevent sleep while running"
            description="Keep your computer awake while Claude Code is running a task."
            control={
              <Switch
                checked={preventSleep}
                onChange={(preventSleep) => patchGeneral({ preventSleep })}
                label="Prevent sleep while running"
              />
            }
          />
          <SettingsRow
            title="Confirm dangerous commands"
            description="Ask before running destructive shell commands (rm, git reset --hard, and similar)."
            control={
              <Switch
                checked={confirmDangerous}
                onChange={(confirmDangerous) => patchGeneral({ confirmDangerous })}
                label="Confirm dangerous commands"
              />
            }
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
