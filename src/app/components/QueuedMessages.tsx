"use client";

import { memo } from "react";
import { TrashIcon } from "../chat/components/icons";
import type { QueuedMessage } from "@/stores";

/**
 * The stack of messages queued while a turn is generating, shown just above the
 * composer (matching the reference). Each row shows the message text plus:
 *  - "Steer" — send it NOW (interrupt the running turn), don't wait.
 *  - delete — drop it from the queue.
 * They auto-send in order as turns complete; this list lets you reorder-to-front
 * (steer) or remove before that happens.
 */

/** A small "return / send now" glyph for the Steer action. */
function SteerGlyph() {
  return (
    <svg width={13} height={13} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 4v3a2 2 0 0 0 2 2h6M9 6l3 3-3 3"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function QueuedRow({
  message,
  onSteer,
  onRemove,
}: {
  message: QueuedMessage;
  onSteer: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="group flex items-center gap-2 rounded-[11.2px] border border-card-border bg-bubble-bg/60 px-2.5 py-1.5">
      {message.images.length ? (
        <span className="shrink-0 text-[11px] font-medium text-text-faint">
          {message.images.length}★
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-text-primary">
        {message.text || "(attachment)"}
      </span>
      <button
        type="button"
        onClick={() => onSteer(message.id)}
        title="Send now, interrupting the current response"
        className="flex shrink-0 items-center gap-1 rounded-[7px] px-1.5 py-0.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-nav-active-bg hover:text-text-strong"
      >
        <SteerGlyph />
        Steer
      </button>
      <button
        type="button"
        aria-label="Remove from queue"
        onClick={() => onRemove(message.id)}
        className="flex size-6 shrink-0 items-center justify-center rounded-[7px] text-text-secondary transition-colors hover:bg-nav-active-bg hover:text-text-strong"
      >
        <TrashIcon width={14} height={14} />
      </button>
    </div>
  );
}

export const QueuedMessages = memo(function QueuedMessages({
  messages,
  onSteer,
  onRemove,
}: {
  messages: QueuedMessage[];
  onSteer: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (messages.length === 0) return null;
  return (
    <div className="mb-2 flex flex-col gap-1.5">
      {messages.map((m) => (
        <QueuedRow
          key={m.id}
          message={m}
          onSteer={onSteer}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
});
