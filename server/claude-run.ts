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
  // TODO(images): Claude Code 2.1.x exposes no `--image`/attachment flag for
  // `-p`. The only supported path is `--input-format stream-json`, feeding a
  // user message whose `content` carries image blocks over stdin — a larger
  // protocol change than the current positional-prompt spawn. Until we adopt
  // stream-json input, `opts.images` is intentionally not forwarded to the CLI.
  if (opts.images && opts.images.length) {
    // no-op for now; see TODO above.
  }

  // prompt is the trailing positional arg
  args.push(opts.prompt);

  // Log the effective run config (not the prompt) so it's easy to confirm the
  // permission mode / model the UI selected actually reached the CLI.
  console.log(
    `[claude-run] mode=${opts.permissionMode || "acceptEdits"} model=${opts.model ?? "default"} ${opts.sessionId ? "resume" : "new"}`,
  );

  // Holds the spawned child so the stream's `cancel` can kill it if the client
  // disconnects (e.g. navigates away) instead of leaking a `claude` process.
  let child: ReturnType<typeof spawn> | undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      // Once the stream is closed (client gone, or we called close ourselves),
      // any late child output must NOT be enqueued — that throws
      // "Controller is already closed" and crashes the request. `safeEnqueue`
      // and `safeClose` make every emit a no-op after close.
      let closed = false;
      const safeEnqueue = (bytes: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(bytes);
        } catch {
          closed = true;
        }
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      try {
        child = spawn(CLAUDE_BIN, args, {
          cwd: opts.cwd,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err) {
        safeEnqueue(
          sse("error", { message: `failed to spawn claude: ${String(err)}` })
        );
        safeClose();
        return;
      }

      safeEnqueue(sse("start", { sessionId: opts.sessionId ?? null }));

      let buf = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        let idx: number;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          try {
            safeEnqueue(sse("message", JSON.parse(line)));
          } catch {
            safeEnqueue(sse("log", { line }));
          }
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        safeEnqueue(sse("stderr", { line: chunk.toString("utf8") }));
      });

      child.on("error", (err) => {
        safeEnqueue(sse("error", { message: String(err) }));
        safeClose();
      });

      child.on("close", (code) => {
        if (buf.trim()) {
          try {
            safeEnqueue(sse("message", JSON.parse(buf.trim())));
          } catch {
            safeEnqueue(sse("log", { line: buf.trim() }));
          }
        }
        safeEnqueue(sse("done", { code }));
        safeClose();
      });
    },
    // Client disconnected — stop the CLI so we don't leak the process.
    cancel() {
      try {
        child?.kill();
      } catch {
        /* already gone */
      }
    },
  });
}
