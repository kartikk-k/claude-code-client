"use client";

/**
 * The bottom terminal panel. It spans the chat column AND the right panel (the
 * whole area to the right of the left sidebar) because it's rendered below that
 * horizontal row in the shell. Toggled from the chat header / right-panel header
 * (⌘J): it stays mounted and animates its height 0 ↔ open so it slides up/down
 * smoothly. Its open height is drag-adjustable via the top-edge handle.
 *
 * NOTE: A PTY backend exists at ws://localhost:4317/api/pty?cwd=<cwd>, but
 * node-pty output does not flow under Bun yet, so the live terminal (xterm)
 * wiring is intentionally deferred pending backend (Bun/node-pty) support. This
 * pane stays a static prompt placeholder until then.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { TerminalTabIcon, AddTabIcon, XIcon } from "../chat/components/icons";
import { Tooltip } from "./ui/Tooltip";
import { TerminalView } from "./TerminalView";
import {
  useChatLayout,
  useUiStore,
  BOTTOM_MIN_HEIGHT as MIN_HEIGHT,
  BOTTOM_MAX_HEIGHT as MAX_HEIGHT,
  BOTTOM_DEFAULT_HEIGHT as DEFAULT_HEIGHT,
} from "@/stores";

export function BottomTerminalPanel({
  open,
  cwd,
  onClose,
  sessionId,
}: {
  open: boolean;
  /** Active session's working directory — shown as the terminal's cwd + tab. */
  cwd?: string;
  onClose: () => void;
  /** Active session id — keys the persisted per-chat height. */
  sessionId?: string;
}) {
  // Per-chat height: seed from the store, commit on pointer-up.
  const layout = useChatLayout(sessionId);
  const patchLayout = useUiStore((s) => s.patchLayout);
  const [height, setHeight] = useState(layout.bottomHeight ?? DEFAULT_HEIGHT);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  // Re-seed when the active chat changes (each chat keeps its own height).
  useEffect(() => {
    setHeight(layout.bottomHeight ?? DEFAULT_HEIGHT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const dir = cwd || "~";
  // The tab label is the working directory's last path segment (or "~").
  const tabName = dir === "~" ? "~" : dir.split("/").filter(Boolean).pop() || dir;

  const clamp = (h: number) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h));

  const onPointerMove = useCallback((e: PointerEvent) => {
    const s = dragState.current;
    if (!s) return;
    // Handle is on the TOP edge: dragging up (negative dy) grows the panel.
    const dy = e.clientY - s.startY;
    setHeight(clamp(s.startHeight - dy));
  }, []);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
    setDragging(false);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    setHeight((h) => {
      patchLayout(sessionId, { bottomHeight: h });
      return h;
    });
  }, [onPointerMove, patchLayout, sessionId]);

  const onHandleDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragState.current = { startY: e.clientY, startHeight: height };
      setDragging(true);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [height, onPointerMove, onPointerUp],
  );

  return (
    <div
      aria-hidden={!open}
      className={cx(
        "relative shrink-0 overflow-hidden border-t border-panel-border bg-app-bg",
        // Height animates on open/close, but NOT while dragging the handle.
        !dragging &&
          "transition-[height] duration-300 ease-[var(--ease-out-quart)]",
      )}
      style={{
        height: open ? height : 0,
        borderTopWidth: open ? undefined : 0,
        pointerEvents: open ? undefined : "none",
      }}
    >
      {/* Top-edge resize handle — drag to adjust the panel height. */}
      <button
        type="button"
        aria-label="Resize terminal panel"
        onPointerDown={onHandleDown}
        tabIndex={open ? 0 : -1}
        className="group absolute inset-x-0 top-0 z-10 flex h-2 cursor-row-resize touch-none items-start justify-center focus:outline-none"
      >
        <span
          className={cx(
            "h-px w-full transition-colors duration-150 ease-out",
            dragging
              ? "bg-[var(--primary)]"
              : "bg-transparent group-hover:bg-[var(--primary)]",
          )}
        />
      </button>

      {/* Inner pinned to the current height so the slide doesn't squish content. */}
      <div className="flex flex-col" style={{ height }}>
        {/* Tab strip */}
        <div className="flex h-10 shrink-0 items-center gap-1.5 px-2">
          <div className="flex h-7 items-center gap-2 rounded-[9px] bg-bubble-bg px-2.5">
            <TerminalTabIcon width={15} height={15} className="icon-muted" />
            <span className="max-w-[160px] truncate text-[13px] font-medium leading-5 text-text-strong">
              {tabName}
            </span>
            <button
              type="button"
              aria-label="Close terminal tab"
              onClick={onClose}
              className="-mr-0.5 flex size-5 items-center justify-center rounded-full text-text-secondary transition-colors duration-150 ease-out hover:bg-nav-active-bg hover:text-text-strong"
            >
              <XIcon width={13} height={13} />
            </button>
          </div>
          <Tooltip label="New terminal tab" side="top">
            <button
              type="button"
              aria-label="New terminal tab"
              className="flex size-7 items-center justify-center rounded-[9px] icon-muted transition-[opacity,background-color] duration-150 ease-out hover:bg-bubble-bg hover:opacity-100"
            >
              <AddTabIcon width={16} height={16} />
            </button>
          </Tooltip>

          <Tooltip label="Close panel" shortcut="⌘J" side="top">
            <button
              type="button"
              aria-label="Close bottom panel"
              onClick={onClose}
              className="ml-auto flex size-7 items-center justify-center rounded-[9px] icon-muted transition-[opacity,background-color] duration-150 ease-out hover:bg-bubble-bg hover:opacity-100"
            >
              <XIcon width={15} height={15} />
            </button>
          </Tooltip>
        </div>

        {/* Live terminal — real shell in the session's working directory.
            Remounts (via key=cwd) when the active chat's cwd changes. */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {open ? <TerminalView key={cwd ?? "~"} cwd={cwd} /> : null}
        </div>
      </div>
    </div>
  );
}

const cx = (...parts: Array<string | false | undefined>) =>
  parts.filter(Boolean).join(" ");
