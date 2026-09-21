/**
 * Terminal over a Bun WebSocket, backed by a persistent interactive shell.
 *
 * A true PTY isn't available here (node-pty doesn't build under Bun, and
 * `script` needs a TTY on its own stdin which spawn can't provide), so we run
 * the login shell (`-i`) with piped stdio. Shell state (cwd, env, aliases)
 * persists across commands — real `ls`/`git`/`npm`/scripts work. Two gaps from
 * a true TTY are papered over: output LF is translated to CRLF (so multi-line
 * output doesn't stair-step in xterm), and the CLIENT echoes keystrokes locally
 * (a piped shell can't). Tab-completion and full raw-mode TUIs (vim) need a real
 * TTY and aren't supported.
 *
 * Wire-up (see index.ts): hono/bun's `createBunWebSocket()` gives us
 *   - `upgradeWebSocket` — the handler mounted at GET /api/pty
 *   - `websocket`        — the Bun socket handler exported on the server object
 *
 * Protocol:
 *   connect: ws://localhost:4317/api/pty?cwd=<cwd>&cols=<n>&rows=<n>
 *   server → client: shell output as text frames (LF→CRLF translated)
 *   client → server: completed command LINES (client does local echo/editing);
 *                    a JSON {"type":"resize",...} frame is accepted + ignored.
 *   ws close → the shell is killed.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { WSContext } from "hono/ws";

// This shell-based terminal has no native dependency, so it is always available.
export const PTY_AVAILABLE = true;

// Track the child PTY per live socket so message/close handlers can reach it.
const shells = new WeakMap<object, ChildProcessWithoutNullStreams>();

/** Build the hono `upgradeWebSocket` events for a given request context. */
export function ptyEvents(cwd: string, cols: number, rows: number) {
  return {
    onOpen(_evt: Event, ws: WSContext) {
      const shell = process.env.SHELL || "/bin/zsh";
      const dir = cwd || process.env.HOME || process.cwd();
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(shell, ["-i"], {
          cwd: dir,
          env: {
            ...process.env,
            TERM: "xterm-256color",
            PAGER: "cat",
            GIT_PAGER: "cat",
            COLUMNS: String(cols || 80),
            LINES: String(rows || 24),
          },
        });
      } catch (err) {
        ws.close(1011, `terminal spawn failed: ${String(err)}`);
        return;
      }
      shells.set(ws.raw as object, child);

      // Shell output → client. The shell has piped stdio (not a TTY), so it
      // emits Unix "\n"; xterm needs "\r\n" to return the cursor to column 0
      // (otherwise multi-line output stair-steps). Translate LF→CRLF here.
      const forward = (buf: Buffer) => {
        try {
          const text = buf
            .toString("utf8")
            // zsh prints a reverse-video "%" + a run of spaces then a CR to mark
            // output that lacked a trailing newline. We render plain text, so
            // drop that whole marker line.
            .replace(/%\s{2,}\r?/g, "")
            // LF→CRLF so multi-line output doesn't stair-step in xterm.
            .replace(/\r?\n/g, "\r\n");
          ws.send(text);
        } catch {
          /* socket gone */
        }
      };
      child.stdout.on("data", forward);
      child.stderr.on("data", forward);
      child.on("close", (code) => {
        try {
          ws.send(`\r\n\x1b[90m[process exited: ${code ?? 0}]\x1b[0m\r\n`);
          ws.close(1000, "terminal exited");
        } catch {
          /* already closed */
        }
      });
      child.on("error", (err) => {
        try {
          ws.send(`\r\n\x1b[31m[terminal error: ${String(err)}]\x1b[0m\r\n`);
        } catch {
          /* ignore */
        }
      });
    },

    onMessage(evt: MessageEvent, ws: WSContext) {
      const child = shells.get(ws.raw as object);
      if (!child) return;
      const data =
        typeof evt.data === "string"
          ? evt.data
          : Buffer.from(evt.data as ArrayBuffer).toString("utf8");
      // Resize control frames are accepted; we can't ioctl the script PTY, so
      // we just export COLUMNS/LINES is not retroactive — best-effort no-op.
      if (data.startsWith("{")) {
        try {
          const msg = JSON.parse(data);
          if (msg && msg.type === "resize") return;
        } catch {
          /* not a control frame — fall through to write raw keystrokes */
        }
      }
      // Raw keystrokes straight to the PTY — it echoes + line-edits + completes.
      try {
        child.stdin.write(data);
      } catch {
        /* stdin closed */
      }
    },

    onClose(_evt: CloseEvent, ws: WSContext) {
      const child = shells.get(ws.raw as object);
      if (child) {
        try {
          child.kill();
        } catch {
          /* already dead */
        }
        shells.delete(ws.raw as object);
      }
    },
  };
}
