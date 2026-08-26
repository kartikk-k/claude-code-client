"use client";

import { useState, type ReactNode } from "react";
import {
  ChevronRightIcon,
  TerminalIcon,
  FileIcon,
  WrenchIcon,
  SearchIcon,
  GlobeIcon,
  DocsIcon,
} from "../../chat/components/icons";
import { CodeBlock } from "./CodeBlock";

/**
 * Compact, collapsible card representing a single tool_use (and its paired
 * tool_result). Collapsed by default; expanding reveals the full input (as a
 * CodeBlock) and a truncated monospace dump of the result. Never throws — all
 * value formatting is defensive.
 */

const RESULT_LIMIT = 4000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function iconFor(name: string): ReactNode {
  const n = name.toLowerCase();
  if (n === "bash" || n.includes("terminal") || n.includes("shell"))
    return <TerminalIcon width={16} height={16} />;
  if (n === "read" || n === "write" || n === "edit" || n === "multiedit" || n.includes("file"))
    return <FileIcon width={16} height={16} />;
  if (n === "grep" || n === "glob" || n.includes("search"))
    return <SearchIcon width={16} height={16} />;
  if (n === "webfetch" || n.includes("fetch") || n.includes("http"))
    return <GlobeIcon width={16} height={16} />;
  if (n === "websearch")
    return <SearchIcon width={16} height={16} />;
  if (n.includes("docs"))
    return <DocsIcon width={16} height={16} />;
  return <WrenchIcon width={16} height={16} />;
}

/** One-line summary of the invocation, derived from the tool + its input. */
function summarize(name: string, input: unknown): string {
  const n = name.toLowerCase();
  const rec = isRecord(input) ? input : undefined;

  if (rec) {
    if (n === "read" || n === "write" || n === "edit" || n === "multiedit") {
      const fp = asString(rec.file_path) ?? asString(rec.path);
      if (fp) return fp;
    }
    if (n === "bash") {
      const cmd = asString(rec.command);
      if (cmd) return cmd.replace(/\s+/g, " ").trim();
    }
    if (n === "grep" || n === "glob") {
      const p = asString(rec.pattern);
      if (p) return p;
    }
    if (n === "webfetch" || n === "websearch") {
      const u = asString(rec.url) ?? asString(rec.query);
      if (u) return u;
    }
    if (n === "task") {
      const d = asString(rec.description) ?? asString(rec.subagent_type);
      if (d) return d;
    }
  }

  const json = safeJson(input);
  const oneLine = json.replace(/\s+/g, " ").trim();
  return oneLine.length > 120 ? oneLine.slice(0, 120) + "…" : oneLine;
}

/** Flatten a tool_result content payload to displayable text. */
function resultText(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  // tool_result content is often an array of { type: "text", text }
  if (Array.isArray(result)) {
    const parts = result
      .map((p) => {
        if (typeof p === "string") return p;
        if (isRecord(p) && typeof p.text === "string") return p.text;
        return safeJson(p);
      })
      .filter(Boolean);
    return parts.join("\n");
  }
  if (isRecord(result) && typeof result.text === "string") return result.text;
  return safeJson(result);
}

export function ToolCard({
  name,
  input,
  result,
  isError,
}: {
  name: string;
  input: unknown;
  result?: unknown;
  isError?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const summary = summarize(name, input);
  const inputJson = isRecord(input) && Object.keys(input).length
    ? safeJson(input)
    : typeof input === "string"
      ? input
      : safeJson(input);
  const resText = resultText(result);
  const truncated = resText.length > RESULT_LIMIT;
  const shownResult = truncated ? resText.slice(0, RESULT_LIMIT) + "\n…" : resText;

  return (
    <div
      className={[
        "my-1.5 overflow-hidden rounded-[11.2px] border bg-tool-bg",
        isError ? "border-red-500/40" : "border-card-border",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
      >
        <span
          className={[
            "shrink-0 transition-transform duration-150",
            open ? "rotate-90" : "",
            isError ? "text-red-500" : "text-text-secondary",
          ].join(" ")}
        >
          <ChevronRightIcon width={14} height={14} />
        </span>
        <span className={isError ? "text-red-500" : "text-text-secondary"}>
          {iconFor(name)}
        </span>
        <span
          className={[
            "shrink-0 text-[13px] font-medium",
            isError ? "text-red-500" : "text-text-strong",
          ].join(" ")}
        >
          {name}
        </span>
        {summary ? (
          <span className="truncate font-mono text-[12px] text-text-secondary">
            {summary}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="border-t border-card-border px-3 py-2">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-faint">
            Input
          </div>
          <CodeBlock code={inputJson} lang="json" />

          {resText ? (
            <>
              <div className="mb-1 mt-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">
                {isError ? "Error" : "Result"}
              </div>
              <pre
                className={[
                  "max-h-[320px] overflow-auto whitespace-pre-wrap rounded-[8.4px] bg-tool-bg px-3 py-2 font-mono text-[12px] leading-[1.5]",
                  isError ? "text-red-500" : "text-text-primary",
                ].join(" ")}
              >
                {shownResult}
              </pre>
              {truncated ? (
                <div className="mt-1 text-[11px] text-text-faint">
                  Output truncated.
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
