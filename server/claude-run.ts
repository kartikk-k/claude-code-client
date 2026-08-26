/**
 * Drives the `claude` CLI to send a prompt to a session and stream the response.
 *
 * Verified against Claude Code 2.1.212 (see research):
 *   claude -p --resume <id> --output-format stream-json
 *          --include-partial-messages --verbose "<prompt>"
 * - `--resume` APPENDS the turn to the same ~/.claude/projects/<enc-cwd>/<id>.jsonl
 *   (does not fork), as long as we spawn with the SAME cwd.
 * - For a brand-new session, the caller passes a fresh UUID and we use
 *   `--session-id` so we own the id up front.
 * - Output is JSONL: forward `content_block_delta` (text_delta) for live typing;
 *   the `type:"result"` line marks end-of-turn.
 * - Headless mode can't answer permission prompts, so we pass a non-interactive
 *   `--permission-mode` (default acceptEdits). We deliberately DO NOT use
 *   `--dangerously-skip-permissions`.
 */
import { spawn } from "node:child_process";

// Prefer the tested Homebrew binary; fall back to PATH resolution.
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

export type SendOpts = {
  cwd: string;
  /** existing session to resume+append; omit for a new session */
  sessionId?: string;
  /** new session id to create (UUID) when there is no sessionId to resume */
  newSessionId?: string;
  prompt: string;
  images?: string[];
  model?: string;
  /** acceptEdits | plan | dontAsk | manual | auto | bypassPermissions */
  permissionMode?: string;
};

function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  );
}

export function sendMessage(opts: SendOpts): ReadableStream<Uint8Array> {
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--permission-mode",
    opts.permissionMode || "acceptEdits",
  ];
  if (opts.model) args.push("--model", opts.model);
  if (opts.sessionId) {
    args.push("--resume", opts.sessionId);
  } else if (opts.newSessionId) {
    args.push("--session-id", opts.newSessionId);
  }
  // prompt is the trailing positional arg
  args.push(opts.prompt);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let child;
      try {
        child = spawn(CLAUDE_BIN, args, {
          cwd: opts.cwd,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err) {
        controller.enqueue(
          sse("error", { message: `failed to spawn claude: ${String(err)}` })
        );
        controller.close();
        return;
      }

      controller.enqueue(sse("start", { sessionId: opts.sessionId ?? null }));

      let buf = "";
      child.stdout.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        let idx: number;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          try {
            controller.enqueue(sse("message", JSON.parse(line)));
          } catch {
            controller.enqueue(sse("log", { line }));
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        controller.enqueue(sse("stderr", { line: chunk.toString("utf8") }));
      });

      child.on("error", (err) => {
        controller.enqueue(sse("error", { message: String(err) }));
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });

      child.on("close", (code) => {
        if (buf.trim()) {
          try {
            controller.enqueue(sse("message", JSON.parse(buf.trim())));
          } catch {
            controller.enqueue(sse("log", { line: buf.trim() }));
          }
        }
        controller.enqueue(sse("done", { code }));
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });
}
