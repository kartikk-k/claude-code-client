"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SETTINGS_NAV, ALL_SETTINGS_ITEMS } from "../nav";
import type { IconName } from "../../chat/components/icons";
import {
  GearIcon,
  SparkleIcon,
  CommandIcon,
  BrainIcon,
  ShieldIcon,
  PluginsIcon,
  BulbIcon,
  ChevronRightIcon,
  SearchIcon,
} from "../../chat/components/icons";

/** Resolve a nav icon key to its glyph component. */
function NavGlyph({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  const map: Partial<
    Record<IconName, React.ComponentType<React.SVGProps<SVGSVGElement>>>
  > = {
    gear: GearIcon,
    sparkle: SparkleIcon,
    grid: CommandIcon,
    brain: BrainIcon,
    shield: ShieldIcon,
    plug: PluginsIcon,
    bulb: BulbIcon,
  };
  const Icon = map[name] ?? GearIcon;
  return <Icon className={className} />;
}

/**
 * Left rail of the settings window: a "Back to app" link, a search box that
 * filters panes, and the grouped nav. The active pane is derived from the
 * current pathname. Matches the reference layout; colors are ours.
 */
export function SettingsSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const activeSlug = pathname.split("/")[2] ?? "general";

  // Filter panes by label + keywords when searching.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return ALL_SETTINGS_ITEMS.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.keywords?.some((k) => k.includes(q))
    );
  }, [query]);

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-panel-border bg-app-bg">
      {/* Back to app */}
      <div className="px-3 pb-2 pt-3">
        <Link
          href="/"
          className="flex h-9 w-full items-center gap-2 rounded-[11px] px-2 text-left text-sm font-medium text-text-primary transition-colors hover:bg-nav-active-bg/60"
        >
          <ChevronRightIcon className="size-4 rotate-180 icon-muted" />
          <span>Back to app</span>
        </Link>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex h-9 items-center gap-2 rounded-[11px] border border-control-border bg-control-bg px-2.5">
          <SearchIcon className="size-4 icon-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings…"
            className="min-w-0 flex-1 bg-transparent text-[13px] leading-5 text-text-primary outline-none placeholder:text-text-faint"
          />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 pb-3">
        {filtered ? (
          <div className="mt-1 flex flex-col gap-0.5">
            {filtered.length === 0 ? (
              <p className="px-2.5 py-2 text-[13px] text-text-faint">
                No settings found
              </p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => {
                    setQuery("");
                    router.push(`/settings/${item.slug}`);
                  }}
                  className={rowClass(item.slug === activeSlug)}
                >
                  <NavGlyph name={item.icon} className="size-4 icon-muted" />
                  <span className="flex-1 truncate">{item.label}</span>
                </button>
              ))
            )}
          </div>
        ) : (
          SETTINGS_NAV.map((group) => (
            <div key={group.title} className="mt-3 first:mt-1">
              <p className="px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.4px] text-text-heading">
                {group.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/settings/${item.slug}`}
                    aria-current={item.slug === activeSlug ? "page" : undefined}
                    className={rowClass(item.slug === activeSlug)}
                  >
                    <NavGlyph name={item.icon} className="size-4 icon-muted" />
                    <span className="flex-1 truncate">{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}

function rowClass(active: boolean): string {
  return [
    "flex h-9 w-full items-center gap-2.5 rounded-[11px] px-2.5 text-left text-[13px] leading-5 transition-colors duration-150 ease-out",
    active
      ? "bg-nav-active-bg font-medium text-text-strong"
      : "font-medium text-text-secondary hover:bg-nav-active-bg/60 hover:text-text-primary",
  ].join(" ");
}
