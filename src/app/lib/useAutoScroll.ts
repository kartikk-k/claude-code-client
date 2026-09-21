"use client";

/**
 * Chat-transcript auto-scroll behavior.
 *
 * Rules (matching the product spec):
 *  - When a chat OPENS (session id changes) → jump to the bottom, because that's
 *    where the user continues.
 *  - While content GROWS (streaming tokens, new messages) → keep pinned to the
 *    bottom, BUT only if the user was already at/near the bottom. If they've
 *    scrolled up to read, we must NOT yank them back down.
 *  - Expose `atBottom` so the UI can show a "scroll to bottom" affordance when
 *    the user is not at the bottom, plus `scrollToBottom()` to act on it.
 *
 * "Near the bottom" uses a small threshold so a slightly-off-bottom position
 * (sub-pixel rounding, a few px of overscroll) still counts as pinned.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** How close to the bottom (px) still counts as "at the bottom". */
const BOTTOM_THRESHOLD = 80;

export function useAutoScroll({
  scrollRef,
  /** Changes whenever the visible content grows (message count, streamed len). */
  contentSignal,
  /** Changes when the conversation identity changes (open a different chat). */
  conversationKey,
}: {
  scrollRef: React.RefObject<HTMLElement | null>;
  contentSignal: number | string;
  conversationKey: string | null | undefined;
}) {
  const [atBottom, setAtBottom] = useState(true);
  // Ref mirror so the scroll handler and effects read the latest value without
  // re-subscribing. `atBottom` state drives rendering; this drives logic.
  const atBottomRef = useRef(true);

  const isAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
  }, [scrollRef]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
      atBottomRef.current = true;
      setAtBottom(true);
    },
    [scrollRef]
  );

  // Track the user's scroll position → keep `atBottom` in sync so the button
  // shows/hides and the pin-to-bottom logic knows whether it's allowed to run.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const bottom = isAtBottom();
      atBottomRef.current = bottom;
      setAtBottom(bottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // initialize
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, isAtBottom]);

  // Opening a chat → jump straight to the bottom (no animation; it's the
  // starting position, not a movement the user should watch). The transcript
  // often streams in AFTER this fires, so also mark us "at bottom" and let the
  // content-grew effect below re-pin once messages (and their images) lay out.
  useLayoutEffect(() => {
    if (conversationKey == null) return;
    atBottomRef.current = true;
    setAtBottom(true);
    scrollToBottom("auto");
    // A couple of rAFs catch late layout (async transcript, image reflow).
    const r1 = requestAnimationFrame(() => {
      scrollToBottom("auto");
      requestAnimationFrame(() => scrollToBottom("auto"));
    });
    return () => cancelAnimationFrame(r1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationKey]);

  // Content grew (new message or streamed tokens): stay pinned to the bottom
  // ONLY if the user was already there. Always "auto" (instant) so rapid token
  // updates don't fight a smooth animation and lag behind the stream.
  useLayoutEffect(() => {
    if (!atBottomRef.current) return;
    scrollToBottom("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentSignal]);

  return { atBottom, scrollToBottom };
}
