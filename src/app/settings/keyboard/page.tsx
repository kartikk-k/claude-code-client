"use client";

import { useMemo, useState } from "react";
import { SettingsTitle } from "../components/primitives";
import { SearchIcon, EditIcon, TrashIcon } from "../../chat/components/icons";
import { usePrefsStore, DEFAULT_SHORTCUTS } from "@/stores";

/** Render a shortcut combo as small key caps. */
function Keys({ combo }: { combo: string | null }) {
  if (!combo) {
    return <span className="text-[13px] leading-5 text-text-faint">Unassigned</span>;
  }
  // Split into individual glyphs (the combos above have no separators).
  const chars = Array.from(combo);
  return (
    <span className="inline-flex items-center gap-1">
      {chars.map((c, i) => (
        <kbd
          key={i}
          className="flex h-6 min-w-6 items-center justify-center rounded-md border border-control-border bg-control-bg px-1.5 font-sans text-[12px] leading-4 text-text-primary"
        >
          {c}
        </kbd>
      ))}
    </span>
  );
}

/**
 * Keyboard shortcuts pane — a searchable list of bindings with edit/reset
 * affordances, matching the reference. Editing is UI-only for now.
 */
export default function KeyboardSettings() {
  const shortcuts = usePrefsStore((s) => s.shortcuts);
  const setShortcuts = usePrefsStore((s) => s.setShortcuts);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shortcuts;
    return shortcuts.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }, [shortcuts, query]);

  return (
    <>
      <SettingsTitle
        action={
          <button
            type="button"
            onClick={() => setShortcuts(DEFAULT_SHORTCUTS)}
            className="rounded-[10px] border border-control-border bg-control-bg px-3 py-1.5 text-[13px] font-medium leading-5 text-text-primary transition-colors hover:bg-nav-active-bg/60"
          >
            Reset all to defaults
          </button>
        }
      >
        Keyboard shortcuts
      </SettingsTitle>

      {/* Search */}
      <div className="mb-5 flex h-11 items-center gap-2.5 rounded-[14px] border border-control-border bg-control-bg px-3.5">
        <SearchIcon className="size-4 icon-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search shortcuts"
          className="min-w-0 flex-1 bg-transparent text-[14px] leading-5 text-text-primary outline-none placeholder:text-text-faint"
        />
      </div>

      <div className="overflow-hidden rounded-[16px] border border-card-border bg-row-bg divide-y divide-row-divider">
        {visible.map((s) => (
          <div
            key={s.id}
            className="group flex items-center gap-4 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium leading-5 text-text-strong">
                {s.label}
              </div>
              <p className="mt-0.5 text-[13px] leading-[18px] text-text-secondary">
                {s.description}
              </p>
            </div>
            <Keys combo={s.keys} />
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={`Edit ${s.label} shortcut`}
                className="flex size-7 items-center justify-center rounded-md icon-faint opacity-0 transition-opacity hover:bg-nav-active-bg/60 group-hover:opacity-100"
              >
                <EditIcon className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Clear ${s.label} shortcut`}
                onClick={() =>
                  setShortcuts(
                    shortcuts.map((x) => (x.id === s.id ? { ...x, keys: null } : x))
                  )
                }
                className="flex size-7 items-center justify-center rounded-md icon-faint opacity-0 transition-opacity hover:bg-nav-active-bg/60 group-hover:opacity-100"
              >
                <TrashIcon className="size-4" />
              </button>
            </div>
          </div>
        ))}
        {visible.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-text-faint">
            No shortcuts match “{query}”.
          </div>
        ) : null}
      </div>
    </>
  );
}
