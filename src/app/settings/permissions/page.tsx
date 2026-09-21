"use client";

import { useState } from "react";
import {
  SettingsTitle,
  SettingsSection,
  SettingsCard,
  SettingsRow,
} from "../components/primitives";
import { Switch, Select } from "../components/controls";
import { PlusIcon, XIcon } from "../../chat/components/icons";
import { usePrefsStore } from "@/stores";

/** Permission modes, matching the composer's permission pill. */
const MODES = [
  { value: "plan", label: "Ask for approval" },
  { value: "acceptEdits", label: "Approve for me" },
  { value: "bypassPermissions", label: "Full access" },
] as const;

type Mode = (typeof MODES)[number]["value"];

/**
 * Permissions settings — the default permission mode a session runs with, plus
 * an allow/deny list of tools. This maps to Claude Code's permission model
 * (plan / acceptEdits / bypassPermissions) rather than the reference app's
 * generic "full access" switch.
 */
export default function PermissionsSettings() {
  const { mode, askOutsideWorkspace, allowNetwork, allowed, denied } =
    usePrefsStore((s) => s.permissions);
  const patchPermissions = usePrefsStore((s) => s.patchPermissions);

  const fullAccess = mode === "bypassPermissions";

  return (
    <>
      <SettingsTitle>Permissions</SettingsTitle>

      <SettingsSection title="Default behavior">
        <SettingsCard>
          <SettingsRow
            title="Permission mode"
            description="How Claude Code asks before reading, editing, or running commands in a new session."
            control={
              <Select<Mode>
                value={mode}
                onChange={(mode) => patchPermissions({ mode })}
                minWidth={180}
                options={MODES.map((m) => ({ value: m.value, label: m.label }))}
              />
            }
          />
          <SettingsRow
            title="Ask before acting outside the workspace"
            description="Require approval before editing files or running commands outside the project folder."
            control={
              <Switch
                checked={askOutsideWorkspace}
                onChange={(askOutsideWorkspace) => patchPermissions({ askOutsideWorkspace })}
                label="Ask before acting outside the workspace"
              />
            }
          />
          <SettingsRow
            title="Allow network access"
            description={
              fullAccess ? (
                <>
                  Full access is on: Claude Code can edit any file and run
                  commands with network without approval. This significantly
                  increases the risk of data loss or unexpected behavior.
                </>
              ) : (
                "Let tools reach the network (fetch, install, curl) without a per-command prompt."
              )
            }
            control={
              <Switch
                checked={fullAccess || allowNetwork}
                onChange={(allowNetwork) => patchPermissions({ allowNetwork })}
                label="Allow network access"
              />
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Tool rules">
        <ToolList
          title="Always allow"
          description="Tools that never require a prompt. Supports glob patterns like Bash(git *)."
          accent="allow"
          items={allowed}
          onChange={(allowed) => patchPermissions({ allowed })}
        />
        <div className="h-4" />
        <ToolList
          title="Always deny"
          description="Tools that are blocked outright, even in Full access mode."
          accent="deny"
          items={denied}
          onChange={(denied) => patchPermissions({ denied })}
        />
      </SettingsSection>
    </>
  );
}

/** An editable chip list of tool patterns (add via input, remove via ×). */
function ToolList({
  title,
  description,
  accent,
  items,
  onChange,
}: {
  title: string;
  description: string;
  accent: "allow" | "deny";
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setDraft("");
  };
  const chipClass =
    accent === "allow"
      ? "border-[color:var(--switch-on)]/30 text-text-primary"
      : "border-[color:var(--agent-accent)]/30 text-text-primary";

  return (
    <SettingsCard>
      <div className="px-4 py-3.5">
        <div className="text-[14px] font-medium leading-5 text-text-strong">
          {title}
        </div>
        <p className="mt-1 text-[13px] leading-[18px] text-text-secondary">
          {description}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((tool) => (
            <span
              key={tool}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border bg-control-bg px-2.5 py-1 font-mono text-[12px] leading-4",
                chipClass,
              ].join(" ")}
            >
              {tool}
              <button
                type="button"
                aria-label={`Remove ${tool}`}
                onClick={() => onChange(items.filter((t) => t !== tool))}
                className="text-text-faint transition-colors hover:text-text-strong"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
          <div className="inline-flex items-center gap-1 rounded-full border border-dashed border-control-border px-2 py-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
              placeholder="Add a tool…"
              className="w-[110px] bg-transparent font-mono text-[12px] leading-4 text-text-primary outline-none placeholder:text-text-faint"
            />
            <button
              type="button"
              aria-label="Add tool"
              onClick={add}
              className="text-text-faint transition-colors hover:text-text-strong"
            >
              <PlusIcon className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
