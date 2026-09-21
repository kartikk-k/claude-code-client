"use client";

/**
 * A real terminal — xterm.js rendering, connected to the server's PTY WebSocket
 * (ws://<server>/api/pty?cwd=<cwd>). The server runs a genuine pseudo-terminal
 * (a Node node-pty bridge), so the shell echoes, colorizes (`ls --color`), does
 * tab completion, arrow-key history, and full-screen apps work. We just forward
 * raw keystrokes and render the bytes that come back — no local line discipline.
 *
 * The terminal reflows on panel resize (FitAddon + a resize message to the PTY),
 * so changing the right-panel width re-wraps correctly. xterm is loaded
 * dynamically (client-only) to keep it out of the SSR bundle.
 */
import { useEffect, useRef } from "react";
import { SERVER_URL } from "../lib/api";

export function TerminalView({
  cwd,
  className = "",
}: {
  /** Working directory the shell opens in. */
  cwd?: string;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      // Dynamic import: xterm touches `window`, so it must not run during SSR.
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      await import("@xterm/xterm/css/xterm.css");
      if (disposed) return;

      // Pull theme colors from the app's CSS tokens so the terminal matches.
      const css = getComputedStyle(document.documentElement);
      const tok = (name: string, fallback: string) =>
        css.getPropertyValue(name).trim() || fallback;

      const term = new Terminal({
        cursorBlink: true,
        allowTransparency: true,
        // xterm can't resolve CSS vars — use a concrete monospace stack.
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12.5,
        lineHeight: 1.2,
        theme: {
          // Transparent background so the terminal sits on the panel's own
          // surface (no separate dark box). foreground/ANSI still readable.
          background: "rgba(0,0,0,0)",
          foreground: tok("--code-text", "#e1e4e8"),
          cursor: tok("--primary", "#3c9eff"),
          selectionBackground: "rgba(120,120,120,0.35)",
        },
        allowProposedApi: true,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      try {
        fit.fit();
      } catch {
        /* host not measured yet */
      }

      // Refit on container resize.
      const ro = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          /* ignore */
        }
      });
      ro.observe(host);

      // --- WebSocket to the server shell ---
      const wsBase = SERVER_URL.replace(/^http/, "ws");
      const url = `${wsBase}/api/pty?cwd=${encodeURIComponent(cwd ?? "")}`;
      const ws = new WebSocket(url);
      let open = false;
      ws.onopen = () => {
        open = true;
        term.focus();
      };
      ws.onmessage = (e) => term.write(String(e.data));
      ws.onclose = () => {
        if (!disposed) term.write("\r\n\x1b[90m[disconnected]\x1b[0m\r\n");
      };

      // Real PTY on the server: it echoes, colorizes, does completion + history
      // itself. We just forward raw keystrokes and render whatever comes back.
      term.onData((data) => {
        if (open) ws.send(data);
      });

      // Keep the PTY's size in sync with the rendered grid so line-wrapping and
      // full-screen apps reflow correctly when the panel is resized.
      const sendSize = () => {
        try {
          if (open)
            ws.send(
              JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }),
            );
        } catch {
          /* ignore */
        }
      };
      const prevOnOpen = ws.onopen;
      ws.onopen = (ev) => {
        (prevOnOpen as ((e: Event) => void) | null)?.call(ws, ev);
        sendSize();
      };
      // Refit + notify the PTY whenever the container resizes.
      const roResize = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          /* ignore */
        }
        sendSize();
      });
      roResize.observe(host);

      cleanup = () => {
        ro.disconnect();
        roResize.disconnect();
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        term.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [cwd]);

  return (
    <div
      className={`h-full min-h-0 w-full overflow-hidden px-2 py-1.5 ${className}`}
      ref={hostRef}
    />
  );
}
