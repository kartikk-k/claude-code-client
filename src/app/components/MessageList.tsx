"use client";

import { memo, useEffect, useMemo, useState } from "react";
import type { ChatMessage, ContentBlock } from "../lib/types";
import { Markdown } from "./blocks/Markdown";
import { ToolCard } from "./blocks/ToolCard";
import {
  ChevronRightIcon,
  CopyIcon,
  CheckIcon,
  RefreshIcon,
  SparkleIcon,
} from "../chat/components/icons";

/**
 * Renders a full transcript. Responsibilities:
 *  - pair every tool_use with its tool_result (indexed across ALL messages,
 *    since a result frequently lands in a later message than its call);
 *  - lay out user turns as right-aligned bubbles and assistant/system turns as
 *    left-aligned full-width blocks;
 *  - expose sub-agent (Task) hand-offs via onOpenAgent.
 */

type ToolResult = { content: unknown; is_error?: boolean };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Extract a data: / http image URL from an image content block, if present. */
function imageSrc(block: ContentBlock): string | undefined {
  if (block.type !== "image") return undefined;
  const src = (block as { source?: unknown }).source;
  if (typeof src === "string") return src;
  if (isRecord(src)) {
    if (src.type === "base64" && typeof src.data === "string") {
      const media =
        typeof src.media_type === "string" ? src.media_type : "image/png";
      return `data:${media};base64,${src.data}`;
    }
    if (typeof src.url === "string") return src.url;
  }
  return undefined;
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------- small pieces */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      onClick={() => {
        try {
          navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1000);
        } catch {
          /* ignore */
        }
      }}
      className="flex size-6 items-center justify-center rounded-[8.4px] text-text-secondary transition-colors hover:bg-bubble-bg hover:text-text-strong"
    >
      {copied ? (
        <CheckIcon width={14} height={14} />
      ) : (
        <CopyIcon width={14} height={14} />
      )}
    </button>
  );
}

function Thought({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-text-secondary transition-colors hover:text-text-strong"
      >
        <span
          className={[
            "transition-transform duration-150",
            open ? "rotate-90" : "",
          ].join(" ")}
        >
          <ChevronRightIcon width={16} height={16} />
        </span>
        <span className="text-sm leading-5">Thought</span>
      </button>
      {open ? (
        <div className="mt-1 border-l-2 border-row-divider pl-3 text-sm leading-5 text-text-secondary">
          <Markdown text={text} />
        </div>
      ) : null}
    </div>
  );
}

function SubAgentChip({
  agentId,
  label,
  onOpenAgent,
}: {
  agentId: string;
  label?: string;
  onOpenAgent?: (agentId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenAgent?.(agentId)}
      className="my-1.5 flex items-center gap-1.5 rounded-[11.2px] border border-card-border bg-tool-bg px-2.5 py-1.5 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
      style={{ color: "var(--agent-accent)" }}
    >
      <SparkleIcon width={14} height={14} />
      <span className="text-[13px] font-medium">
        Sub-agent{label ? `: ${label}` : ""}
      </span>
      <ChevronRightIcon width={14} height={14} />
    </button>
  );
}

/* ----------------------------------------------------------------- turns */

function collectText(content: ContentBlock[]): string {
  return content
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n\n");
}

// Memoized: a durable message's `content` is immutable, so an unchanged turn
// never re-renders (and never re-parses its Markdown) when the list re-renders
// for streaming or a chat switch.
const UserTurn = memo(function UserTurn({ message }: { message: ChatMessage }) {
  const text = collectText(message.content);
  const images = message.content
    .map(imageSrc)
    .filter((s): s is string => Boolean(s));

  if (!text && images.length === 0) return null;

  return (
    <div className="flex flex-col items-end gap-2 py-2 pl-10">
      {images.length ? (
        <div className="flex max-w-[70%] flex-wrap justify-end gap-2">
          {images.map((src, idx) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={idx}
              src={src}
              alt="attachment"
              className="max-h-48 rounded-[11.2px] border border-card-border object-cover"
            />
          ))}
        </div>
      ) : null}
      {text ? (
        <div className="max-w-[70%] overflow-hidden rounded-[16.8px] bg-bubble-bg px-3 py-1.5">
          <div className="text-sm leading-5 text-text-strong">
            <Markdown text={text} />
          </div>
        </div>
      ) : null}
    </div>
  );
});

const AssistantTurn = memo(function AssistantTurn({
  message,
  resultsById,
  onOpenAgent,
}: {
  message: ChatMessage;
  resultsById: Map<string, ToolResult>;
  onOpenAgent?: (agentId: string) => void;
}) {
  const copyText = collectText(message.content);

  const rendered: React.ReactNode[] = [];
  message.content.forEach((block, idx) => {
    switch (block.type) {
      case "text": {
        const t = (block as { text?: string }).text ?? "";
        if (t.trim())
          rendered.push(
            <div key={idx} className="text-sm leading-5">
              <Markdown text={t} />
            </div>
          );
        break;
      }
      case "thinking": {
        const tb = block as { thinking?: string; text?: string };
        const t = tb.thinking ?? tb.text ?? "";
        if (t.trim()) rendered.push(<Thought key={idx} text={t} />);
        break;
      }
      case "tool_use": {
        const tu = block as Extract<ContentBlock, { type: "tool_use" }>;
        const res = resultsById.get(tu.id);
        if (tu.name === "Task") {
          const input = isRecord(tu.input) ? tu.input : undefined;
          const label =
            input && typeof input.description === "string"
              ? input.description
              : input && typeof input.subagent_type === "string"
                ? input.subagent_type
                : undefined;
          // Prefer the message's agentId; the tool_use id is a usable fallback
          // key for opening the sub-agent panel.
          const agentId = message.agentId ?? tu.id;
          rendered.push(
            <SubAgentChip
              key={idx}
              agentId={agentId}
              label={label}
              onOpenAgent={onOpenAgent}
            />
          );
        }
        rendered.push(
          <ToolCard
            key={`${idx}-tool`}
            name={tu.name}
            input={tu.input}
            result={res?.content}
            isError={res?.is_error}
          />
        );
        break;
      }
      // tool_result blocks are rendered inline with their tool_use, skip here
      case "tool_result":
        break;
      default:
        break;
    }
  });

  if (message.agentId && !message.content.some((b) => b.type === "tool_use")) {
    // A sidechain/sub-agent turn surfaced directly — offer a jump chip.
    rendered.unshift(
      <SubAgentChip
        key="agent-chip"
        agentId={message.agentId}
        onOpenAgent={onOpenAgent}
      />
    );
  }

  if (rendered.length === 0) return null;

  return (
    <div className="flex flex-col py-2">
      <div className="flex flex-col gap-1 text-text-primary">{rendered}</div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <CopyButton text={copyText} />
        <button
          type="button"
          aria-label="Regenerate"
          className="flex size-6 items-center justify-center rounded-[8.4px] text-text-secondary transition-colors hover:bg-bubble-bg hover:text-text-strong"
        >
          <RefreshIcon width={14} height={14} />
        </button>
        <span className="text-[13px] font-medium leading-[19.5px] text-text-secondary">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
});

/* --------------------------------------------------------------- component */

export const MessageList = memo(function MessageList({
  messages,
  onOpenAgent,
  streamingText,
  pendingUserText,
}: {
  messages: ChatMessage[];
  onOpenAgent?: (agentId: string) => void;
  /** Live assistant text streaming in for the current turn (append at the end). */
  streamingText?: string;
  /** The just-sent user prompt, shown optimistically before it lands on disk. */
  pendingUserText?: string;
}) {
  // Index every tool_result by its tool_use_id across the whole transcript.
  const resultsById = useMemo(() => {
    const map = new Map<string, ToolResult>();
    for (const m of messages) {
      for (const block of m.content) {
        if (block.type === "tool_result") {
          const tr = block as Extract<ContentBlock, { type: "tool_result" }>;
          map.set(tr.tool_use_id, {
            content: tr.content,
            is_error: tr.is_error,
          });
        }
      }
    }
    return map;
  }, [messages]);

  // Windowing: only render the most recent `WINDOW` turns on open. A large
  // transcript (hundreds/thousands of turns) otherwise mounts tens of thousands
  // of DOM nodes at once — seconds of work that made switching INTO a big chat
  // lag. You land at the bottom anyway, so the tail is what matters; a "Show
  // earlier" control reveals the rest in chunks. Resets to the tail whenever the
  // conversation changes (a new `messages` array identity from a chat switch).
  const WINDOW = 40;
  const STEP = 80;
  const [visibleCount, setVisibleCount] = useState(WINDOW);
  useEffect(() => {
    // On a chat switch (messages identity changes), re-window to the tail.
    setVisibleCount(WINDOW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const hiddenCount = Math.max(0, messages.length - visibleCount);
  const visibleMessages =
    hiddenCount > 0 ? messages.slice(hiddenCount) : messages;

  return (
    <div className="mx-auto w-full max-w-[832px] px-8 py-4">
      {hiddenCount > 0 ? (
        <div className="flex justify-center py-2">
          <button
            type="button"
            onClick={() =>
              setVisibleCount((c) => Math.min(messages.length, c + STEP))
            }
            className="rounded-full border border-panel-border px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-nav-active-bg hover:text-text-primary"
          >
            Show {Math.min(STEP, hiddenCount)} earlier{" "}
            {hiddenCount === 1 ? "message" : "messages"}
          </button>
        </div>
      ) : null}
      {visibleMessages.map((m) => (
        // `content-visibility: auto` lets the browser SKIP layout + paint for
        // any turn scrolled out of view, so a 1000-message transcript no longer
        // lays out 50k nodes at once — the multi-second mount/reflow that made
        // switching to a big chat lag. `contain-intrinsic-size` gives an
        // estimated height so the scrollbar + scroll position stay stable while
        // off-screen turns are un-rendered. `data-msg-id` anchors the ToC rail.
        <div
          key={m.uuid}
          data-msg-id={m.uuid}
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: "auto 120px",
          }}
        >
          {m.role === "user" ? (
            <UserTurn message={m} />
          ) : (
            <AssistantTurn
              message={m}
              resultsById={resultsById}
              onOpenAgent={onOpenAgent}
            />
          )}
        </div>
      ))}

      {/* Optimistic user bubble for the just-sent prompt, shown only until the
          durable transcript catches up (i.e. it isn't already the last turn). */}
      {pendingUserText && !endsWithUserText(messages, pendingUserText) ? (
        <div className="flex flex-col items-end gap-2 py-2 pl-10">
          <div className="max-w-[70%] overflow-hidden rounded-[16.8px] bg-bubble-bg px-3 py-1.5">
            <div className="text-sm leading-5 text-text-strong">
              <Markdown text={pendingUserText} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Live assistant response streaming in. A pulsing caret marks it active. */}
      {streamingText !== undefined ? (
        <div className="flex flex-col py-2">
          <div className="flex flex-col gap-1 text-text-primary">
            <div className="text-sm leading-5">
              <Markdown text={streamingText} />
              <span className="ml-0.5 inline-block h-4 w-[6px] translate-y-0.5 animate-pulse bg-text-faint align-baseline" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

/** True if the last user turn's text already equals the pending prompt (so we
 *  don't render the optimistic bubble twice after the transcript reconciles). */
function endsWithUserText(messages: ChatMessage[], text: string): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    return collectText(messages[i].content).trim() === text.trim();
  }
  return false;
}
