/**
 * Real terminal over a Bun WebSocket, backed by node-pty.
 *
 * Wire-up (see index.ts): hono/bun's `createBunWebSocket()` gives us
 *   - `upgradeWebSocket` — the handler mounted at GET /api/pty
 *   - `websocket`        — the Bun socket handler exported on the server object
 *
 * Protocol:
 *   connect: ws://localhost:4317/api/pty?cwd=<cwd>&cols=<n>&rows=<n>
 *   server → client: raw pty output as text frames
 *   client → server: keystrokes as text frames; a JSON control frame
 *                    {"type":"resize","cols":N,"rows":N} resizes the pty.
 *   ws close → pty is killed.
 *
 * node-pty ships a native binding; if it fails to load under Bun we degrade:
 * PTY_AVAILABLE is false and the route returns 501 instead of crashing.
 */
import type { WSContext } from "hono/ws";

// Lazily probe node-pty so a native-load failure never crashes the server.
let ptyMod: typeof import("node-pty") | null = null;
export let PTY_AVAILABLE = false;
try {
  // Synchronous require keeps startup simple; this file is imported once.
  ptyMod = require("node-pty");
  PTY_AVAILABLE = typeof ptyMod?.spawn === "function";
} catch (err) {
  console.warn(
    `[claude-client] node-pty unavailable, /api/pty disabled: ${String(err)}`
  );
}

type PtyProc = ReturnType<NonNullable<typeof ptyMod>["spawn"]>;

// Track the pty per live socket so message/close handlers can reach it.
const sockets = new WeakMap<object, PtyProc>();

/** Build the hono `upgradeWebSocket` events for a given request context. */
export function ptyEvents(cwd: string, cols: number, rows: number) {
  return {
    onOpen(_evt: Event, ws: WSContext) {
      if (!PTY_AVAILABLE || !ptyMod) {
        ws.close(1011, "pty unavailable");
        return;
      }
      const shell = process.env.SHELL || "/bin/zsh";
      let proc: PtyProc;
      try {
        proc = ptyMod.spawn(shell, [], {
          name: "xterm-color",
          cwd: cwd || process.env.HOME || process.cwd(),
          cols: cols || 80,
          rows: rows || 24,
          env: process.env as Record<string, string>,
        });
      } catch (err) {
        ws.close(1011, `spawn failed: ${String(err)}`);
        return;
      }
      sockets.set(ws.raw as object, proc);
      // pty output → ws
      proc.onData((data: string) => {
        try {
          ws.send(data);
        } catch {
          /* socket gone */
        }
      });
      // pty exit → close the socket
      proc.onExit(() => {
        try {
          ws.close(1000, "pty exited");
        } catch {
          /* already closed */
        }
      });
    },

    onMessage(evt: MessageEvent, ws: WSContext) {
      const proc = sockets.get(ws.raw as object);
      if (!proc) return;
      const data =
        typeof evt.data === "string"
          ? evt.data
          : Buffer.from(evt.data as ArrayBuffer).toString("utf8");
      // A well-formed JSON control frame resizes; anything else is keystrokes.
      if (data.startsWith("{")) {
        try {
          const msg = JSON.parse(data);
          if (msg && msg.type === "resize") {
            proc.resize(Number(msg.cols) || 80, Number(msg.rows) || 24);
            return;
          }
        } catch {
          /* not a control frame — fall through to write */
        }
      }
      proc.write(data);
    },

    onClose(_evt: CloseEvent, ws: WSContext) {
      const proc = sockets.get(ws.raw as object);
      if (proc) {
        try {
          proc.kill();
        } catch {
          /* already dead */
        }
        sockets.delete(ws.raw as object);
      }
    },
  };
}
