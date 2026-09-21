"use client";

/**
 * A minimal in-panel web browser tab. A top bar with back / forward / reload
 * controls and a URL/search input, and an <iframe> filling the rest. Submitting
 * the input navigates: a URL-ish string is opened directly (https:// prepended
 * if it has no scheme), anything else becomes a Google search.
 *
 * The current url is lifted to the parent (persisted per-chat on the tab), so a
 * page survives tab switches and reloads. Back/forward keep a small local
 * history stack — the iframe is same-origin-sandboxed so we can't read the
 * browser's own history across cross-origin pages.
 *
 * Note: many sites refuse to be framed (X-Frame-Options / CSP frame-ancestors);
 * that's expected and out of our control — we just render the iframe.
 */
import { useEffect, useRef, useState } from "react";
import {
  ChevronRightIcon,
  RefreshIcon,
  GlobeIcon,
} from "../chat/components/icons";

const cx = (...parts: Array<string | false | undefined>) =>
  parts.filter(Boolean).join(" ");

/** Turn a raw input into a navigable URL: a URL-ish string → itself (with a
 *  scheme), everything else → a Google search. */
function resolveUrl(raw: string): string {
  const q = raw.trim();
  if (!q) return "";
  // Already has a scheme.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(q)) return q;
  // Looks like a domain/host (has a dot, no spaces) → treat as a URL.
  const looksLikeUrl = /^[^\s]+\.[^\s]+$/.test(q) && !/\s/.test(q);
  if (looksLikeUrl) return `https://${q}`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export function BrowserTab({
  url,
  onUrlChange,
}: {
  /** The current page url (persisted on the tab). Empty → the start state. */
  url?: string;
  /** Commit a navigation so the parent can persist it on the tab. */
  onUrlChange: (url: string) => void;
}) {
  const [value, setValue] = useState(url ?? "");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Local navigation history for the back/forward buttons.
  const history = useRef<string[]>(url ? [url] : []);
  const pos = useRef<number>(url ? 0 : -1);
  const [reloadNonce, setReloadNonce] = useState(0);
  // Track history bounds via state so the buttons enable/disable correctly.
  const [nav, setNav] = useState({ canBack: false, canForward: false });

  // Re-sync the input when the active url changes (e.g. tab switch).
  useEffect(() => {
    setValue(url ?? "");
    if (url && history.current[pos.current] !== url) {
      history.current = [url];
      pos.current = 0;
      setNav({ canBack: false, canForward: false });
    }
  }, [url]);

  const commit = (next: string) => {
    if (!next) return;
    // Push onto the history stack, dropping any forward entries.
    history.current = history.current.slice(0, pos.current + 1);
    history.current.push(next);
    pos.current = history.current.length - 1;
    setNav({
      canBack: pos.current > 0,
      canForward: false,
    });
    onUrlChange(next);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const resolved = resolveUrl(value);
    if (!resolved) return;
    setValue(resolved);
    commit(resolved);
  };

  const go = (delta: number) => {
    const next = pos.current + delta;
    if (next < 0 || next >= history.current.length) return;
    pos.current = next;
    const target = history.current[next];
    setValue(target);
    setNav({
      canBack: pos.current > 0,
      canForward: pos.current < history.current.length - 1,
    });
    onUrlChange(target);
  };

  const reload = () => setReloadNonce((n) => n + 1);

  const btn =
    "flex size-7 shrink-0 items-center justify-center rounded-[8px] icon-muted transition-[background-color,opacity] duration-150 ease-out enabled:hover:bg-bubble-bg enabled:hover:opacity-100 disabled:opacity-40";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <form
        onSubmit={onSubmit}
        className="flex h-11 shrink-0 items-center gap-1 border-b border-panel-border px-2"
      >
        <button
          type="button"
          aria-label="Back"
          onClick={() => go(-1)}
          disabled={!nav.canBack}
          className={btn}
        >
          <ChevronRightIcon width={16} height={16} className="rotate-180" />
        </button>
        <button
          type="button"
          aria-label="Forward"
          onClick={() => go(1)}
          disabled={!nav.canForward}
          className={btn}
        >
          <ChevronRightIcon width={16} height={16} />
        </button>
        <button
          type="button"
          aria-label="Reload"
          onClick={reload}
          disabled={!url}
          className={btn}
        >
          <RefreshIcon width={15} height={15} />
        </button>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search or enter a URL"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="min-w-0 flex-1 rounded-[10px] bg-bubble-bg px-3 py-1.5 text-[13px] leading-5 text-text-strong outline-none placeholder:text-text-faint focus:ring-1 focus:ring-[var(--primary)]"
        />
      </form>

      {/* Viewport */}
      <div className="min-h-0 flex-1">
        {url ? (
          <iframe
            key={`${url}#${reloadNonce}`}
            ref={iframeRef}
            src={url}
            title="Browser"
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6">
            <GlobeIcon width={24} height={24} className="icon-faint" />
            <p className="text-sm font-medium leading-5 text-text-secondary">
              Start browsing
            </p>
            <p className="text-center text-[12px] leading-4 text-text-faint">
              Enter a URL to open a page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
