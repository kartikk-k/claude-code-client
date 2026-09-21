/**
 * Real, PERSISTENT terminal over a Bun WebSocket.
 *
 * The Bun runtime can't load node-pty's native binding, so each terminal is a
 * tiny Node subprocess (`pty-bridge.cjs`) that owns a genuine pseudo-terminal
 * and relays it over stdio. Because it's a real TTY the shell echoes, colorizes,
 * tab-completes, keeps history and runs full-screen apps — the client's xterm.js
 * just renders the bytes.
 *
 * PERSISTENCE: sessions are keyed by a client-supplied `id` and kept ALIVE when
 * the socket disconnects (e.g. the user navigates to another route and the panel
 * unmounts). Each session buffers its recent output; on reconnect we replay that
 * buffer and re-attach the live stream — so the shell keeps running in the
 * background and the terminal resumes exactly where it was, instead of starting a
 * fresh session. Idle sessions with no socket are reaped after a grace period.
 *
 * Wire-up (see index.ts): hono/bun's `createBunWebSocket()` gives us
 *   - `upgradeWebSocket` — the handler mounted at GET /api/pty
 *   - `websocket`        — the Bun socket handler exported on the server object
 *
 * Protocol:
 *   connect: ws://localhost:4317/api/pty?id=<termId>&cwd=<cwd>&cols=<n>&rows=<n>
 *   server → client: raw PTY output (replayed buffer first, then live)
 *   client → server: raw keystrokes; {"type":"resize",cols,rows} resizes.
 *   ws close → the session KEEPS running; it's reaped only after the idle TTL.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { WSContext } from "hono/ws";

const HERE = dirname(fileURLToPath(import.meta.url));
const BRIDGE = join(HERE, "pty-bridge.cjs");
const NODE_BIN = process.env.NODE_BIN || "node";

export const PTY_AVAILABLE = true;

/** How long a session survives with no attached socket before being reaped. */
const IDLE_TTL_MS = 10 * 60 * 1000; // 10 minutes
/** How much recent output to keep for replay on reconnect. */
const SCROLLBACK_LIMIT = 256 * 1024; // 256 KB

type Session = {
  id: string;
  bridge: ChildProcessWithoutNullStreams;
  /** Recent raw output, replayed to a (re)attaching socket. */
  buffer: string;
  /** The currently attached socket, if any. */
  ws: WSContext | null;
  /** Reap timer that runs while no socket is attached. */
  reapTimer: ReturnType<typeof setTimeout> | null;
};

// All live sessions, keyed by the client-supplied terminal id. This survives
// route changes because it lives on the server, not in the client component.
const sessions = new Map<string, Session>();
// Map a raw socket → the session id it's attached to, for message/close routing.
const socketToId = new WeakMap<object, string>();

function spawnBridge(cwd: string, cols: number, rows: number) {
  return spawn(
    NODE_BIN,
    [BRIDGE, cwd, String(cols || 80), String(rows || 24)],
    { cwd, env: process.env },
  );
}

function appendBuffer(s: Session, chunk: string) {
  s.buffer += chunk;
  if (s.buffer.length > SCROLLBACK_LIMIT) {
    s.buffer = s.buffer.slice(s.buffer.length - SCROLLBACK_LIMIT);
  }
}

function destroySession(s: Session) {
  if (s.reapTimer) clearTimeout(s.reapTimer);
  try {
    s.bridge.stdin.end();
    s.bridge.kill();
  } catch {
    /* already gone */
  }
  sessions.delete(s.id);
}

/** Build the hono `upgradeWebSocket` events for a given request context. */
export function ptyEvents(
  id: string,
  cwd: string,
  cols: number,
  rows: number,
) {
  return {
    onOpen(_evt: Event, ws: WSContext) {
      const dir = cwd || process.env.HOME || process.cwd();
      let s = sessions.get(id);

      if (s) {
        // Reattach to the existing background session: cancel its reaper, swap
        // in the new socket, and replay the buffered scrollback.
        if (s.reapTimer) {
          clearTimeout(s.reapTimer);
          s.reapTimer = null;
        }
        s.ws = ws;
        socketToId.set(ws.raw as object, id);
        if (s.buffer) {
          try {
            ws.send(s.buffer);
          } catch {
            /* ignore */
          }
        }
        return;
      }

      // Fresh session: spawn the PTY bridge and register it.
      let bridge: ChildProcessWithoutNullStreams;
      try {
        bridge = spawnBridge(dir, cols, rows);
      } catch (err) {
        ws.close(1011, `terminal bridge spawn failed: ${String(err)}`);
        return;
      }
      s = { id, bridge, buffer: "", ws, reapTimer: null };
      sessions.set(id, s);
      socketToId.set(ws.raw as object, id);
      const session = s;

      bridge.stdout.on("data", (buf: Buffer) => {
        const text = buf.toString("utf8");
        appendBuffer(session, text);
        try {
          session.ws?.send(text);
        } catch {
          /* socket gone; output is still buffered for reconnect */
        }
      });
      bridge.stderr.on("data", (buf: Buffer) => {
        const msg = buf.toString("utf8").trim();
        if (msg && /load failed|spawn failed/.test(msg)) {
          const line = `\r\n\x1b[31m[terminal unavailable: ${msg}]\x1b[0m\r\n`;
          appendBuffer(session, line);
          try {
            session.ws?.send(line);
          } catch {
            /* ignore */
          }
        }
      });
      bridge.on("close", () => {
        try {
          session.ws?.close(1000, "terminal exited");
        } catch {
          /* already closed */
        }
        sessions.delete(session.id);
      });
      bridge.on("error", (err) => {
        const line = `\r\n\x1b[31m[terminal error: ${String(err)}]\x1b[0m\r\n`;
        try {
          session.ws?.send(line);
        } catch {
          /* ignore */
        }
      });
    },

    onMessage(evt: MessageEvent, ws: WSContext) {
      const sid = socketToId.get(ws.raw as object);
      const s = sid ? sessions.get(sid) : undefined;
      if (!s) return;
      const data =
        typeof evt.data === "string"
          ? evt.data
          : Buffer.from(evt.data as ArrayBuffer).toString("utf8");
      if (data.startsWith("{")) {
        try {
          const msg = JSON.parse(data);
          if (msg && msg.type === "resize") {
            s.bridge.stdin.write(
              JSON.stringify({ t: "resize", cols: msg.cols, rows: msg.rows }) +
                "\n",
            );
            return;
          }
        } catch {
          /* not a control frame — treat as keystrokes below */
        }
      }
      s.bridge.stdin.write(JSON.stringify({ t: "data", d: data }) + "\n");
    },

    onClose(_evt: CloseEvent, ws: WSContext) {
      const sid = socketToId.get(ws.raw as object);
      socketToId.delete(ws.raw as object);
      const s = sid ? sessions.get(sid) : undefined;
      if (!s) return;
      // Detach the socket but KEEP the shell running in the background; reap it
      // only if nothing reconnects within the idle TTL.
      if (s.ws === ws) s.ws = null;
      if (!s.reapTimer) {
        s.reapTimer = setTimeout(() => destroySession(s), IDLE_TTL_MS);
      }
    },
  };
}
