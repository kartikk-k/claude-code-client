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

  // --- multiple terminals, persisted per chat (stable ids → persistent PTYs) ---
  const terminals = layout.bottomTerminals ?? [];
  const activeTermId = layout.bottomActiveId;

  // Ensure at least one terminal exists whenever the panel is open.
  useEffect(() => {
    if (open && terminals.length === 0) {
      const id = `bterm-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      patchLayout(sessionId, {
        bottomTerminals: [{ id }],
        bottomActiveId: id,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, terminals.length, sessionId]);

  const addTerminal = () => {
    const id = `bterm-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    patchLayout(sessionId, {
      bottomTerminals: [...terminals, { id }],
      bottomActiveId: id,
    });
  };
  const closeTerminal = (id: string) => {
    const next = terminals.filter((t) => t.id !== id);
    if (next.length === 0) {
      // Closing the last terminal closes the whole panel.
      patchLayout(sessionId, { bottomTerminals: [], bottomActiveId: null });
      onClose();
      return;
    }
    const nextActive =
      activeTermId === id ? next[next.length - 1].id : activeTermId;
    patchLayout(sessionId, {
      bottomTerminals: next,
      bottomActiveId: nextActive,
    });
  };
  const focusTerminal = (id: string) =>
    patchLayout(sessionId, { bottomActiveId: id });

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
        {/* Tab strip — one chip per open terminal, plus a "+" for new ones. */}
        <div className="flex h-10 shrink-0 items-center gap-1.5 overflow-x-auto px-2">
          {terminals.map((t, i) => {
            const isActive = t.id === activeTermId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => focusTerminal(t.id)}
                className={cx(
                  "flex h-7 shrink-0 items-center gap-2 rounded-[9px] px-2.5 transition-colors",
                  isActive
                    ? "bg-bubble-bg text-text-strong"
                    : "text-text-secondary hover:bg-bubble-bg/60",
                )}
              >
                <TerminalTabIcon width={15} height={15} className="icon-muted" />
                <span className="max-w-[140px] truncate text-[13px] font-medium leading-5">
                  {terminals.length > 1 ? `${tabName} ${i + 1}` : tabName}
                </span>
                <span
                  role="button"
                  aria-label="Close terminal tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTerminal(t.id);
                  }}
                  className="-mr-0.5 flex size-5 items-center justify-center rounded-full text-text-secondary transition-colors duration-150 ease-out hover:bg-nav-active-bg hover:text-text-strong"
                >
                  <XIcon width={13} height={13} />
                </span>
              </button>
            );
          })}
          <Tooltip label="New terminal" side="top">
            <button
              type="button"
              aria-label="New terminal tab"
              onClick={addTerminal}
              className="flex size-7 shrink-0 items-center justify-center rounded-[9px] icon-muted transition-[opacity,background-color] duration-150 ease-out hover:bg-bubble-bg hover:opacity-100"
            >
              <AddTabIcon width={16} height={16} />
            </button>
          </Tooltip>

          <Tooltip label="Close panel" shortcut="⌘J" side="top">
            <button
              type="button"
              aria-label="Close bottom panel"
              onClick={onClose}
              className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-[9px] icon-muted transition-[opacity,background-color] duration-150 ease-out hover:bg-bubble-bg hover:opacity-100"
            >
              <XIcon width={15} height={15} />
            </button>
          </Tooltip>
        </div>

        {/* Live terminals. All kept mounted (so each PTY keeps running); only the
            active one is visible. Stable termId → the server resumes the same
            shell session across panel toggles and route changes. */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {open &&
            terminals.map((t) => (
              <div
                key={t.id}
                className={cx(
                  "absolute inset-0",
                  t.id === activeTermId ? "block" : "hidden",
                )}
              >
                <TerminalView termId={`bottom:${t.id}`} cwd={cwd} />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

const cx = (...parts: Array<string | false | undefined>) =>
  parts.filter(Boolean).join(" ");
