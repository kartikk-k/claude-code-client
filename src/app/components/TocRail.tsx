"use client";

/**
 * A thin vertical rail of tick marks pinned to the left edge of the chat
 * transcript — one tick per user message, like a tick-mark scrollbar. As the
 * transcript scrolls, the tick whose message is nearest the top of the viewport
 * is emphasized; a small band of ticks around it also thickens so the active
 * region reads like a soft spotlight (matching the reference). Hovering a tick
 * reveals a preview popover to the right: the user message as a one-line title
 * and a few lines of the assistant's reply beneath.
 *
 * The rail is driven by real scroll position: pass the scroll container via
 * `scrollRef` and a resolver that maps a message id → its element, so clicks
 * scroll to that turn and the active tick follows the user's scrolling.
 *
 * All interaction visuals are transform/opacity only; every tick reserves its
 * emphasized width so hover/active never shift layout.
 */
import { useEffect, useRef, useState } from "react";

export type TocItem = {
  id: string;
  /** The user's message — the popover title (truncated to 1 line). */
  userText: string;
  /** A snippet of the assistant's reply (truncated to a few lines). */
  responsePreview: string;
};

export function TocRail({
  items,
  scrollRef,
  resolveAnchor,
}: {
  items: TocItem[];
  /** The transcript scroll container to observe. */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Maps an item id → its DOM element inside the scroll container. */
  resolveAnchor: (id: string) => HTMLElement | null;
}) {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  // Per-tick row elements, so the shared popover can align to a tick's real
  // vertical center rather than assuming a fixed row height.
  const tickRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Track scroll: the active tick is the last user message whose top has
  // scrolled above a probe line near the top of the viewport. We recompute on
  // every scroll frame (rAF-throttled) reading live geometry, so it stays
  // correct even as messages of very different heights pass by. We also poll
  // the ref until the scroll container mounts, avoiding ref-timing races.
  useEffect(() => {
    let scroller: HTMLElement | null = null;

    const recompute = () => {
      rafRef.current = null;
      if (!scroller) return;
      const probe = scroller.getBoundingClientRect().top + 120;
      let next = 0;
      let found = false;
      for (let i = 0; i < items.length; i++) {
        const el = resolveAnchor(items[i].id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= probe) {
          next = i;
          found = true;
        } else if (found) {
          break;
        }
      }
      setActive(next);
    };

    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(recompute);
    };

    // Wait for the scroll container to exist, then wire listeners.
    let tries = 0;
    const attach = () => {
      scroller = scrollRef.current;
      if (!scroller) {
        if (tries++ < 30) requestAnimationFrame(attach);
        return;
      }
      recompute();
      scroller.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
    };
    attach();

    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [items, scrollRef, resolveAnchor]);

  const jump = (i: number) => {
    const el = resolveAnchor(items[i].id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Keep the last-hovered index so the SINGLE shared popover can animate OUT
  // (fade + slide) after the pointer leaves, instead of unmounting instantly.
  // Its content stays stable during the exit transition. `previewTop` is the
  // hovered tick's real vertical center within the rail.
  const [lastHovered, setLastHovered] = useState(0);
  const [previewTop, setPreviewTop] = useState(0);
  useEffect(() => {
    if (hovered === null) return;
    setLastHovered(hovered);
    const row = tickRefs.current[hovered];
    if (row) setPreviewTop(row.offsetTop + row.offsetHeight / 2);
  }, [hovered]);

  if (items.length === 0) return null;

  const previewItem = items[lastHovered];
  const open = hovered !== null;

  return (
    <div
      ref={railRef}
      className="relative flex flex-col items-start gap-[5px] py-2"
      onMouseLeave={() => setHovered(null)}
    >
      {items.map((item, i) => {
        // Emphasis falls off with distance from the active tick, giving the
        // soft "spotlight" band around the current position.
        const dist = Math.abs(i - active);
        const near = dist === 0 ? 2 : dist <= 1 ? 1 : 0;
        const isHover = hovered === i;
        // Width in px: base 10, +4 per emphasis level, hover forces full.
        const w = isHover ? 22 : 10 + near * 5;
        const strong = i === active || isHover;

        return (
          <div
            key={item.id}
            ref={(el) => {
              tickRefs.current[i] = el;
            }}
            className="relative flex h-[6px] items-center"
            onMouseEnter={() => setHovered(i)}
          >
            <button
              type="button"
              aria-label={`Jump to: ${item.userText.slice(0, 40)}`}
              onClick={() => jump(i)}
              className="flex h-[6px] items-center"
            >
              <span
                className={[
                  "h-[1.5px] rounded-full transition-all duration-200",
                  strong ? "bg-text-primary" : "bg-text-faint",
                ].join(" ")}
                style={{
                  width: w,
                  transitionTimingFunction: "var(--ease-out-quart)",
                }}
              />
            </button>
          </div>
        );
      })}

      {/* A single shared preview popover. It stays mounted and slides to the
          hovered tick's vertical center, fading in/out — so moving between ticks
          glides smoothly instead of cross-fading a new element each time. */}
      <div
        aria-hidden={!open}
        className={[
          "pointer-events-none absolute left-[30px] z-40 w-[320px] -translate-y-1/2 rounded-[16.8px] border border-popover-border bg-popover-bg p-3 backdrop-blur-xl shadow-[0px_10px_30px_-5px_rgba(0,0,0,0.5)]",
          "transition-[opacity,transform,top] duration-200 ease-out",
          open ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-1.5",
        ].join(" ")}
        style={{
          top: previewTop,
          transitionTimingFunction: "var(--ease-out-quart)",
        }}
      >
        <p className="truncate text-sm font-medium leading-5 text-text-strong">
          {previewItem.userText}
        </p>
        {previewItem.responsePreview ? (
          <p className="mt-1 line-clamp-3 text-xs leading-4 text-text-secondary">
            {previewItem.responsePreview}
          </p>
        ) : null}
      </div>
    </div>
  );
}
