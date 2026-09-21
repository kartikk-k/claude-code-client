/**
 * Node PTY bridge — spawned by the Bun server (which can't run node-pty's native
 * binding itself) to give the terminal a REAL pseudo-terminal.
 *
 *   node pty-bridge.cjs <cwd> <cols> <rows>
 *
 * Protocol over this process's own stdio (line-framed JSON on stdin, raw bytes
 * out via a length-prefixed framing on stdout):
 *   - stdin  (from Bun): newline-delimited JSON messages
 *       {"t":"data","d":"<utf8 keystrokes>"}   → written to the PTY
 *       {"t":"resize","cols":N,"rows":N}        → resize the PTY
 *   - stdout (to Bun): raw PTY output, written directly (Bun reads + forwards
 *       it to the WebSocket verbatim).
 *
 * A real PTY means the shell echoes, colorizes (ls --color), does tab completion,
 * arrow-key history, and emits proper control sequences — xterm.js renders it
 * all natively. No local echo or line discipline needed on either side.
 */
"use strict";

let pty;
try {
  pty = require("node-pty");
} catch (err) {
  process.stderr.write(`[pty-bridge] node-pty load failed: ${String(err)}\n`);
  process.exit(2);
}

const cwd = process.argv[2] || process.env.HOME || process.cwd();
const cols = Number(process.argv[3]) || 80;
const rows = Number(process.argv[4]) || 24;
const shell = process.env.SHELL || "/bin/zsh";

let term;
try {
  term = pty.spawn(shell, ["-l"], {
    name: "xterm-256color",
    cwd,
    cols,
    rows,
    env: { ...process.env, TERM: "xterm-256color" },
  });
} catch (err) {
  process.stderr.write(`[pty-bridge] spawn failed: ${String(err)}\n`);
  process.exit(3);
}

// PTY output → our stdout (raw); Bun forwards it to the socket.
term.onData((d) => {
  try {
    process.stdout.write(d);
  } catch {
    /* stdout closed */
  }
});
term.onExit(({ exitCode }) => {
  process.stderr.write(`[pty-bridge] shell exited ${exitCode}\n`);
  process.exit(0);
});

// Control messages arrive as newline-delimited JSON on stdin.
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.t === "data" && typeof msg.d === "string") {
      term.write(msg.d);
    } else if (msg.t === "resize") {
      try {
        term.resize(Number(msg.cols) || cols, Number(msg.rows) || rows);
      } catch {
        /* ignore */
      }
    }
  }
});
process.stdin.on("close", () => {
  try {
    term.kill();
  } catch {
    /* already dead */
  }
  process.exit(0);
});
