"use client";

import Link from "next/link";
import { useState } from "react";
import {
  SettingsTitle,
  SettingsSection,
  SettingsCard,
} from "../components/primitives";
import { Switch } from "../components/controls";
import { PLUGINS } from "../../plugins/catalog";
import { PluginTile } from "../../plugins/components/PluginTile";
import { ChevronRightIcon } from "../../chat/components/icons";

/**
 * Plugins & MCP settings pane — lists the connected MCP servers with an
 * enable/disable toggle, and links out to the full marketplace at /plugins.
 * A thin management surface over the same catalog the marketplace uses.
 */
export default function PluginsSettings() {
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(PLUGINS.filter((p) => p.installed).map((p) => p.id))
  );
  const installed = PLUGINS.filter((p) => p.installed);

  const toggle = (id: string) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <>
      <SettingsTitle
        action={
          <Link
            href="/plugins"
            className="flex h-9 items-center gap-1.5 rounded-[11px] bg-btn-solid-bg px-3.5 text-[13px] font-semibold text-btn-solid-text transition-opacity hover:opacity-90"
          >
            Browse plugins
          </Link>
        }
      >
        Plugins &amp; MCP
      </SettingsTitle>

      <SettingsSection title="Connected servers">
        <SettingsCard>
          {installed.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <Link
                href={`/plugins/${p.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <PluginTile
                  color={p.color}
                  mark={p.mark}
                  logo={p.logo}
                  logoBg={p.logoBg}
                  size={36}
                />
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium leading-5 text-text-strong">
                    {p.name}
                  </div>
                  <div className="truncate text-[13px] leading-[18px] text-text-secondary">
                    {p.tools.length} tools · {p.transport.toUpperCase()}
                  </div>
                </div>
                <ChevronRightIcon className="size-4 shrink-0 icon-faint" />
              </Link>
              <Switch
                checked={enabled.has(p.id)}
                onChange={() => toggle(p.id)}
                label={`Enable ${p.name}`}
              />
            </div>
          ))}
        </SettingsCard>
        <p className="mt-3 px-1 text-[13px] leading-5 text-text-secondary">
          MCP servers extend Claude Code with extra tools. Manage the full
          catalog in the{" "}
          <Link href="/plugins" className="text-link hover:opacity-80">
            plugins marketplace
          </Link>
          .
        </p>
      </SettingsSection>
    </>
  );
}
