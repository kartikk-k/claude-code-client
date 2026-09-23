"use client";

import { memo, useState, type ReactNode } from "react";
import {
  ChevronRightIcon,
  TerminalIcon,
  FileIcon,
  WrenchIcon,
  SearchIcon,
  GlobeIcon,
  DocsIcon,
  FolderIcon,
} from "../../chat/components/icons";
import { ToolCard } from "./ToolCard";

/**
 * A run of CONSECUTIVE tool calls, collapsed under a single summary row
 * ("Ran commands", "Read files, ran commands", …) the way the reference does.
 *
 * Why grouping: an agent turn can fire a dozen tool calls in a row; showing each
 * as its own card floods the transcript. Instead we collapse a consecutive run
 * into one line and let the user expand to see every call. Runs are split
 * whenever a text/thinking block interrupts them, so the timeline order is
 * preserved (Bash → text → Read → text stays three separate groups, and
 * GitHub → Greptile → GitHub stays as one group with the calls in order — never
 * reordered).
 *
 * The last call in a group that has NO result yet is the one currently running;
 * its row shimmers (see `active`).
 */

export type ToolItem = {
  /** stable key */
  id: string;
  name: string;
  input: unknown;
  result?: unknown;
  isError?: boolean;
  /** true while this call is still running (no result yet, live turn) */
  running?: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Icon for a tool, matching ToolCard's mapping. */
function iconFor(name: string): ReactNode {
  const n = name.toLowerCase();
  if (n === "bash" || n.includes("terminal") || n.includes("shell"))
    return <TerminalIcon width={15} height={15} />;
  if (n === "read")
    return <DocsIcon width={15} height={15} />;
  if (n === "write" || n === "edit" || n === "multiedit" || n.includes("file"))
    return <FileIcon width={15} height={15} />;
  if (n === "glob" || n === "ls" || n.includes("list"))
    return <FolderIcon width={15} height={15} />;
  if (n === "grep" || n.includes("search"))
    return <SearchIcon width={15} height={15} />;
  if (n === "webfetch" || n.includes("fetch") || n.includes("http"))
    return <GlobeIcon width={15} height={15} />;
  if (n === "websearch") return <SearchIcon width={15} height={15} />;
  if (n.includes("docs")) return <DocsIcon width={15} height={15} />;
  return <WrenchIcon width={15} height={15} />;
}

/** Past-tense verb for a tool, for the per-call row ("Ran cat …", "Read x.ts"). */
function verbFor(name: string, running?: boolean): string {
  const n = name.toLowerCase();
  const pick = (past: string, present: string) => (running ? present : past);
  if (n === "bash") return pick("Ran", "Running");
  if (n === "read") return pick("Read", "Reading");
  if (n === "write") return pick("Wrote", "Writing");
  if (n === "edit" || n === "multiedit") return pick("Edited", "Editing");
  if (n === "glob" || n === "ls") return pick("Listed files", "Listing files");
  if (n === "grep" || n === "websearch")
    return pick("Searched for", "Searching for");
  if (n === "webfetch") return pick("Fetched", "Fetching");
  if (n === "task") return pick("Ran agent", "Running agent");
  return running ? "Running" : "Ran";
}

/** The one-line detail shown after the verb (command / path / pattern / url). */
function detailFor(name: string, input: unknown): string {
  const n = name.toLowerCase();
  const rec = isRecord(input) ? input : undefined;
  if (rec) {
    if (n === "read" || n === "write" || n === "edit" || n === "multiedit")
      return asString(rec.file_path) ?? asString(rec.path) ?? "";
    if (n === "bash")
      return (asString(rec.command) ?? "").replace(/\s+/g, " ").trim();
    if (n === "glob" || n === "ls")
      return asString(rec.path) ?? asString(rec.pattern) ?? "";
    if (n === "grep") return asString(rec.pattern) ?? "";
    if (n === "websearch") return asString(rec.query) ?? "";
    if (n === "webfetch") return asString(rec.url) ?? "";
    if (n === "task")
      return asString(rec.description) ?? asString(rec.subagent_type) ?? "";
  }
  return "";
}

/**
 * Summary label for the whole group, from the distinct tool categories present,
 * e.g. "Ran commands", "Read files", "Read files, ran commands". Order follows
 * first appearance so it reads naturally.
 */
function groupLabel(items: ToolItem[]): string {
  const phrases: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const n = it.name.toLowerCase();
    let phrase: string;
    if (n === "bash") phrase = "ran commands";
    else if (n === "read") phrase = "read files";
    else if (n === "write") phrase = "wrote files";
    else if (n === "edit" || n === "multiedit") phrase = "edited files";
    else if (n === "glob" || n === "ls") phrase = "listed files";
    else if (n === "grep" || n === "websearch") phrase = "searched";
    else if (n === "webfetch") phrase = "fetched pages";
    else if (n === "task") phrase = "ran agents";
    else phrase = "used tools";
    if (!seen.has(phrase)) {
      seen.add(phrase);
      phrases.push(phrase);
    }
  }
  if (phrases.length === 0) return "Used tools";
  // Capitalize the first phrase only ("Read files, ran commands").
  const joined = phrases.join(", ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** Leading icon for the group header — the icon of its first tool. */
function groupIcon(items: ToolItem[]): ReactNode {
  return iconFor(items[0]?.name ?? "");
}

function ToolRow({ item }: { item: ToolItem }) {
  const [open, setOpen] = useState(false);
  const verb = verbFor(item.name, item.running);
  const detail = detailFor(item.name, item.input);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group/row flex w-full items-center gap-2 py-0.5 text-left"
      >
        <span
          className={[
            "shrink-0 text-text-faint transition-colors",
            item.isError ? "text-red-500" : "group-hover/row:text-text-secondary",
          ].join(" ")}
        >
          {iconFor(item.name)}
        </span>
        <span
          className={[
            "min-w-0 truncate text-[13px] leading-5",
            item.isError ? "text-red-500" : "text-text-secondary",
            item.running ? "tool-shimmer" : "",
          ].join(" ")}
        >
          <span className="text-text-primary">{verb}</span>
          {detail ? (
            <span className="ml-1 font-mono text-text-secondary">{detail}</span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div className="pb-1 pl-6">
          <ToolCard
            name={item.name}
            input={item.input}
            result={item.result}
            isError={item.isError}
          />
        </div>
      ) : null}
    </div>
  );
}

export const ToolGroup = memo(function ToolGroup({
  items,
  /** Expand by default (e.g. while the group is actively running). */
  defaultOpen = false,
}: {
  items: ToolItem[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) return null;

  const anyRunning = items.some((it) => it.running);
  const label = groupLabel(items);

  return (
    <div className="my-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 py-0.5 text-left"
      >
        <span className="shrink-0 text-text-secondary">
          {groupIcon(items)}
        </span>
        <span
          className={[
            "text-[13px] font-medium leading-5 text-text-secondary",
            anyRunning ? "tool-shimmer" : "",
          ].join(" ")}
        >
          {label}
        </span>
        <span
          className={[
            "shrink-0 text-text-faint transition-transform duration-150",
            open ? "rotate-90" : "",
          ].join(" ")}
        >
          <ChevronRightIcon width={13} height={13} />
        </span>
      </button>

      {open ? (
        <div className="mt-0.5 flex flex-col border-l border-card-border pl-3">
          {items.map((it) => (
            <ToolRow key={it.id} item={it} />
          ))}
        </div>
      ) : null}
    </div>
  );
});
