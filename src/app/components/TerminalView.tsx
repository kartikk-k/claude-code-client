"use client";

/**
 * A real terminal — xterm.js rendering, connected to the local server's shell
 * WebSocket (ws://<server>/api/pty?cwd=<cwd>). You type directly in the terminal
 * (inline cursor, no footer input): keystrokes are echoed + line-edited locally
 * by xterm, and each completed line is sent to the shell's stdin on Enter. The
 * shell's stdout/stderr stream back and render (with ANSI colors).
 *
 * The server runs the login shell with piped stdio (node-pty doesn't build under
 * Bun), so it isn't a full TTY — hence local echo + a small line discipline here
 * (backspace, ↑/↓ history, Ctrl-C, Ctrl-U). This covers a coding client's
 * terminal needs; full raw-mode TUIs (vim) aren't supported.
 *
 * xterm is loaded dynamically (client-only) to keep it out of the SSR bundle.
 */
import { useEffect, useRef } from "react";
import { SERVER_URL, api } from "../lib/api";

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
        fontFamily:
          'var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12.5,
        lineHeight: 1.2,
        theme: {
          background: tok("--code-bg", "#1e1e1e"),
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

      // The server shell has piped stdio (no TTY), so it can't echo keystrokes
      // or line-edit. We do that locally in xterm: echo printable chars, handle
      // backspace / Ctrl-C / Ctrl-U / ↑↓ history, and send the whole line to the
      // shell on Enter.
      let lineBuf = "";
      const history: string[] = [];
      let hist = 0;
      const redraw = (next: string) => {
        // Rewrite the current input line: CR, clear-to-EOL, print buffer.
        term.write("\r\x1b[K" + next);
        lineBuf = next;
      };

      // Tab completion of the last word against the real filesystem (via the
      // /api/files endpoint), since a piped shell can't do its own completion.
      const complete = async () => {
        const m = lineBuf.match(/(\S*)$/);
        const word = m ? m[1] : "";
        const slash = word.lastIndexOf("/");
        const dirPart = slash >= 0 ? word.slice(0, slash) : "";
        const prefix = slash >= 0 ? word.slice(slash + 1) : word;
        try {
          const entries = await api.files(cwd ?? "", dirPart);
          const matches = entries.filter((e) => e.name.startsWith(prefix));
          if (matches.length === 0) return;
          if (matches.length === 1) {
            const e = matches[0];
            const completed = e.name.slice(prefix.length) + (e.type === "dir" ? "/" : " ");
            lineBuf += completed;
            term.write(completed);
          } else {
            // Complete the longest common prefix, then list options.
            let lcp = matches[0].name;
            for (const e of matches)
              while (!e.name.startsWith(lcp)) lcp = lcp.slice(0, -1);
            const add = lcp.slice(prefix.length);
            if (add) {
              lineBuf += add;
              term.write(add);
            }
            term.write(
              "\r\n" +
                matches
                  .map((e) => (e.type === "dir" ? e.name + "/" : e.name))
                  .join("  ") +
                "\r\n",
            );
            // Re-emit the prompt line + current buffer (approximate).
            term.write(lineBuf);
          }
        } catch {
          /* completion unavailable — ignore */
        }
      };

      term.onData((data) => {
        if (!open) return;
        // Handle multi-byte escape sequences (arrows) as whole units first.
        if (data === "\x1b[A") {
          if (hist > 0) redraw(history[--hist] ?? "");
          return;
        }
        if (data === "\x1b[B") {
          if (hist < history.length - 1) redraw(history[++hist] ?? "");
          else {
            hist = history.length;
            redraw("");
          }
          return;
        }
        if (data === "\t") {
          void complete();
          return;
        }
        for (const ch of data) {
          const code = ch.charCodeAt(0);
          if (ch === "\r" || ch === "\n") {
            term.write("\r\n");
            ws.send(lineBuf + "\n");
            if (lineBuf.trim()) {
              history.push(lineBuf);
              hist = history.length;
            }
            lineBuf = "";
          } else if (code === 127 || code === 8) {
            if (lineBuf.length > 0) {
              lineBuf = lineBuf.slice(0, -1);
              term.write("\b \b");
            }
          } else if (code === 3) {
            term.write("^C\r\n");
            ws.send("\x03");
            lineBuf = "";
          } else if (code === 21) {
            redraw("");
          } else if (code >= 32) {
            lineBuf += ch;
            term.write(ch);
          }
        }
      });

      cleanup = () => {
        ro.disconnect();
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
      className={`h-full min-h-0 w-full overflow-hidden bg-code-bg px-2 py-1.5 ${className}`}
      ref={hostRef}
    />
  );
}
