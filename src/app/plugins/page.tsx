"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PLUGINS, type Plugin } from "./catalog";
import { PluginTile } from "./components/PluginTile";
import {
  SearchIcon,
  PlusIcon,
  CheckIcon,
  ChevronRightIcon,
} from "../chat/components/icons";

/**
 * Plugins marketplace — a collection of MCP servers Claude Code can connect to.
 * Shows the currently-installed servers as a grid, then popular ones to add.
 * Install state is local (UI-only) for now; each plugin links to its detail
 * page. Layout/UX mirror the reference; colors are the app's tokens.
 */
export default function PluginsPage() {
  const [query, setQuery] = useState("");
  const [installed, setInstalled] = useState<Set<string>>(
    () => new Set(PLUGINS.filter((p) => p.installed).map((p) => p.id))
  );

  const toggle = (id: string) =>
    setInstalled((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      !q
        ? PLUGINS
        : PLUGINS.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.tagline.toLowerCase().includes(q) ||
              p.category.toLowerCase().includes(q)
          ),
    [q]
  );

  const installedList = matches.filter((p) => installed.has(p.id));
  const available = matches.filter((p) => !installed.has(p.id));
  const featured = available.filter((p) => p.featured);
  const rest = available.filter((p) => !p.featured);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.5px] text-text-strong">
          Plugins
        </h1>
        <p className="mt-1 text-[14px] leading-5 text-text-secondary">
          Connect Claude Code to MCP servers for extra tools and context.
        </p>
      </header>

      {/* Search */}
      <div className="mb-8 flex h-12 items-center gap-2.5 rounded-[14px] border border-control-border bg-control-bg px-4">
        <SearchIcon className="size-4 icon-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search plugins"
          className="min-w-0 flex-1 bg-transparent text-[14px] leading-5 text-text-primary outline-none placeholder:text-text-faint"
        />
      </div>

      {/* Installed grid */}
      {installedList.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-3 text-[15px] font-medium leading-5 text-text-primary">
            Installed
          </h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {installedList.map((p) => (
              <Link
                key={p.id}
                href={`/plugins/${p.id}`}
                className="group flex items-center gap-3 rounded-[14px] border border-card-border bg-row-bg p-3 transition-colors hover:bg-nav-active-bg/40"
              >
                <PluginTile
                  color={p.color}
                  mark={p.mark}
                  logo={p.logo}
                  logoBg={p.logoBg}
                  size={40}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium leading-5 text-text-strong">
                    {p.name}
                  </div>
                  <div className="truncate text-[12px] leading-4 text-text-secondary">
                    {p.category}
                  </div>
                </div>
                <ChevronRightIcon className="size-4 shrink-0 icon-faint transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Popular / featured */}
      {featured.length > 0 ? (
        <PluginListSection
          title="Popular"
          plugins={featured}
          onToggle={toggle}
          installed={installed}
        />
      ) : null}

      {/* Everything else */}
      {rest.length > 0 ? (
        <PluginListSection
          title="New & noteworthy"
          plugins={rest}
          onToggle={toggle}
          installed={installed}
        />
      ) : null}

      {matches.length === 0 ? (
        <p className="py-10 text-center text-[14px] text-text-faint">
          No plugins match “{query}”.
        </p>
      ) : null}
    </>
  );
}

function PluginListSection({
  title,
  plugins,
  onToggle,
  installed,
}: {
  title: string;
  plugins: Plugin[];
  onToggle: (id: string) => void;
  installed: Set<string>;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-[15px] font-medium leading-5 text-text-primary">
        {title}
      </h2>
      <div className="overflow-hidden rounded-[16px] border border-card-border bg-row-bg divide-y divide-row-divider">
        {plugins.map((p) => (
          <PluginRow
            key={p.id}
            plugin={p}
            installed={installed.has(p.id)}
            onToggle={() => onToggle(p.id)}
          />
        ))}
      </div>
    </section>
  );
}

function PluginRow({
  plugin,
  installed,
  onToggle,
}: {
  plugin: Plugin;
  installed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <Link
        href={`/plugins/${plugin.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <PluginTile
          color={plugin.color}
          mark={plugin.mark}
          logo={plugin.logo}
          logoBg={plugin.logoBg}
          size={38}
        />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium leading-5 text-text-strong">
            {plugin.name}
          </div>
          <div className="truncate text-[13px] leading-[18px] text-text-secondary">
            {plugin.tagline}
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={onToggle}
        aria-label={installed ? `Remove ${plugin.name}` : `Add ${plugin.name}`}
        className={[
          "flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors",
          installed
            ? "border-[color:var(--switch-on)]/40 text-[color:var(--switch-on)]"
            : "border-control-border text-text-secondary hover:bg-nav-active-bg/60 hover:text-text-strong",
        ].join(" ")}
      >
        {installed ? (
          <CheckIcon className="size-4" />
        ) : (
          <PlusIcon className="size-4" />
        )}
      </button>
    </div>
  );
}
