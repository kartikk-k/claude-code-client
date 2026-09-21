/**
 * Real terminal over a Bun WebSocket, backed by a genuine pseudo-terminal.
 *
 * The Bun runtime can't load node-pty's native binding, so we run a tiny Node
 * subprocess (`pty-bridge.cjs`) that owns the real PTY and relays it over its
 * own stdio. Bun ↔ Node bridge ↔ PTY ↔ shell. Because it's a real TTY the shell
 * echoes, colorizes (`ls --color`), does tab completion, arrow-key history and
 * emits proper control sequences — the client's xterm.js renders it all. We
 * forward raw keystrokes in and raw bytes out; no local echo / line discipline.
 *
 * Wire-up (see index.ts): hono/bun's `createBunWebSocket()` gives us
 *   - `upgradeWebSocket` — the handler mounted at GET /api/pty
 *   - `websocket`        — the Bun socket handler exported on the server object
 *
 * Protocol (client ↔ this server):
 *   connect: ws://localhost:4317/api/pty?cwd=<cwd>&cols=<n>&rows=<n>
 *   server → client: raw PTY output as text frames (xterm renders ANSI)
 *   client → server: raw keystrokes as text frames; a JSON control frame
 *                    {"type":"resize","cols","rows"} resizes the PTY.
 *   ws close → the bridge (and its PTY/shell) is killed.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { WSContext } from "hono/ws";

const HERE = dirname(fileURLToPath(import.meta.url));
const BRIDGE = join(HERE, "pty-bridge.cjs");
// Prefer an explicit node; fall back to `node` on PATH.
const NODE_BIN = process.env.NODE_BIN || "node";

// A real PTY needs Node + node-pty. If those aren't available the /api/pty
// route degrades (see index.ts) — but we optimistically assume yes.
export const PTY_AVAILABLE = true;

// Track the bridge subprocess per live socket.
const bridges = new WeakMap<object, ChildProcessWithoutNullStreams>();

/** Build the hono `upgradeWebSocket` events for a given request context. */
export function ptyEvents(cwd: string, cols: number, rows: number) {
  return {
    onOpen(_evt: Event, ws: WSContext) {
      const dir = cwd || process.env.HOME || process.cwd();
      let bridge: ChildProcessWithoutNullStreams;
      try {
        bridge = spawn(
          NODE_BIN,
          [BRIDGE, dir, String(cols || 80), String(rows || 24)],
          { cwd: dir, env: process.env },
        );
      } catch (err) {
        ws.close(1011, `terminal bridge spawn failed: ${String(err)}`);
        return;
      }
      bridges.set(ws.raw as object, bridge);

      // Raw PTY output (bridge stdout) → client. xterm renders ANSI natively.
      bridge.stdout.on("data", (buf: Buffer) => {
        try {
          ws.send(buf.toString("utf8"));
        } catch {
          /* socket gone */
        }
      });
      // Bridge diagnostics (its stderr) — surface once, dimmed, don't spam.
      bridge.stderr.on("data", (buf: Buffer) => {
        const msg = buf.toString("utf8").trim();
        if (msg && /load failed|spawn failed/.test(msg)) {
          try {
            ws.send(
              `\r\n\x1b[31m[terminal unavailable: ${msg}]\x1b[0m\r\n`,
            );
          } catch {
            /* ignore */
          }
        }
      });
      bridge.on("close", () => {
        try {
          ws.close(1000, "terminal exited");
        } catch {
          /* already closed */
        }
      });
      bridge.on("error", (err) => {
        try {
          ws.send(`\r\n\x1b[31m[terminal error: ${String(err)}]\x1b[0m\r\n`);
        } catch {
          /* ignore */
        }
      });
    },

    onMessage(evt: MessageEvent, ws: WSContext) {
      const bridge = bridges.get(ws.raw as object);
      if (!bridge) return;
      const data =
        typeof evt.data === "string"
          ? evt.data
          : Buffer.from(evt.data as ArrayBuffer).toString("utf8");
      // Resize control frames pass through to the bridge as a resize command;
      // everything else is raw keystrokes.
      if (data.startsWith("{")) {
        try {
          const msg = JSON.parse(data);
          if (msg && msg.type === "resize") {
            bridge.stdin.write(
              JSON.stringify({ t: "resize", cols: msg.cols, rows: msg.rows }) +
                "\n",
            );
            return;
          }
        } catch {
          /* not a control frame — treat as keystrokes below */
        }
      }
      bridge.stdin.write(JSON.stringify({ t: "data", d: data }) + "\n");
    },

    onClose(_evt: CloseEvent, ws: WSContext) {
      const bridge = bridges.get(ws.raw as object);
      if (bridge) {
        try {
          bridge.stdin.end();
          bridge.kill();
        } catch {
          /* already dead */
        }
        bridges.delete(ws.raw as object);
      }
    },
  };
}
