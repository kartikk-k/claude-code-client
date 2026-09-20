"use client";

import { useState } from "react";
import {
  SettingsTitle,
  SettingsSection,
  SettingsCard,
  SettingsRow,
  RowValue,
  RowButton,
} from "../components/primitives";
import { Switch } from "../components/controls";

/** About pane — app/CLI versions, update behavior, and links. */
export default function AboutSettings() {
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [beta, setBeta] = useState(false);

  return (
    <>
      <SettingsTitle>About</SettingsTitle>

      <SettingsSection>
        <SettingsCard>
          <SettingsRow title="Claude Client" control={<RowValue>v0.1.0</RowValue>} />
          <SettingsRow title="Claude Code CLI" control={<RowValue>v2.0.14</RowValue>} />
          <SettingsRow
            title="Check for updates"
            description="You're on the latest version."
            control={<RowButton>Check now</RowButton>}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Updates">
        <SettingsCard>
          <SettingsRow
            title="Install updates automatically"
            description="Download and install new versions in the background."
            control={
              <Switch
                checked={autoUpdate}
                onChange={setAutoUpdate}
                label="Install updates automatically"
              />
            }
          />
          <SettingsRow
            title="Beta channel"
            description="Get early builds. May be less stable."
            control={<Switch checked={beta} onChange={setBeta} label="Beta channel" />}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Resources">
        <SettingsCard>
          <SettingsRow
            title="Documentation"
            control={
              <a
                href="https://docs.claude.com/en/docs/claude-code"
                target="_blank"
                rel="noreferrer"
                className="text-[13px] font-medium text-link transition-opacity hover:opacity-80"
              >
                Open
              </a>
            }
          />
          <SettingsRow
            title="Release notes"
            control={
              <a
                href="https://docs.claude.com/en/release-notes/claude-code"
                target="_blank"
                rel="noreferrer"
                className="text-[13px] font-medium text-link transition-opacity hover:opacity-80"
              >
                Open
              </a>
            }
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
