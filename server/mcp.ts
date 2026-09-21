/**
 * MCP server management via the `claude mcp` CLI. This is the real backend for
 * the Plugins page — installing / removing a plugin actually registers or
 * unregisters an MCP server in Claude Code's config (`~/.claude.json`).
 *
 * Everything shells out to `claude mcp <sub>` and parses its human output. The
 * list command runs a health check, so entries carry a live connection status.
 * All functions resolve (never throw) so a flaky CLI can't crash the server;
 * failures surface as `{ ok: false, error }`.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Live connection status parsed from `claude mcp list`. */
export type McpStatus = "connected" | "needs_auth" | "failed" | "unknown";

export type McpServer = {
  /** Server name (the identifier used by add/remove/get). */
  name: string;
  /** URL (http/sse) or command (stdio) shown in the list. */
  target: string;
  /** Transport, when derivable from the list line. */
  transport?: "http" | "sse" | "stdio";
  /** Live health from the list command's connectivity check. */
  status: McpStatus;
};

export type McpServerDetail = McpServer & {
  scope?: string;
  command?: string;
  args?: string;
  url?: string;
};

/** Run `claude mcp <args>`, resolving to {ok, stdout} — never throws. */
async function claudeMcp(
  args: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await exec("claude", ["mcp", ...args], {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30_000,
    });
    return { ok: true, stdout: stdout ?? "", stderr: stderr ?? "" };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "unknown error",
    };
  }
}

/** Map a status glyph/phrase from `mcp list` to a normalized status. */
function parseStatus(tail: string): McpStatus {
  const t = tail.toLowerCase();
  if (t.includes("needs authentication") || t.includes("needs auth"))
    return "needs_auth";
  if (t.includes("✔") || t.includes("connected")) return "connected";
  if (t.includes("✘") || t.includes("failed")) return "failed";
  return "unknown";
}

/**
 * List installed MCP servers with live status. Parses lines shaped like:
 *   "<name>: <target> - <status>"
 *   "<name>: <target> (HTTP) - <status>"
 */
export async function listMcp(): Promise<{
  ok: boolean;
  servers: McpServer[];
  error?: string;
}> {
  const res = await claudeMcp(["list"]);
  const servers: McpServer[] = [];
  for (const raw of res.stdout.split("\n")) {
    const line = raw.trim();
    // Skip the header line and blanks.
    if (!line || line.startsWith("Checking MCP")) continue;
    const m = /^([^:]+):\s+(.*?)\s+-\s+(.*)$/.exec(line);
    if (!m) continue;
    const name = m[1].trim();
    let target = m[2].trim();
    let transport: McpServer["transport"] | undefined;
    // Trailing "(HTTP)" / "(SSE)" transport hint.
    const tm = /\((HTTP|SSE|STDIO)\)\s*$/i.exec(target);
    if (tm) {
      transport = tm[1].toLowerCase() as McpServer["transport"];
      target = target.replace(/\s*\((HTTP|SSE|STDIO)\)\s*$/i, "").trim();
    } else if (/^https?:\/\//.test(target)) {
      transport = "http";
    } else {
      transport = "stdio";
    }
    servers.push({ name, target, transport, status: parseStatus(m[3]) });
  }
  // `mcp list` may exit non-zero when a server fails its health check, yet still
  // print a valid list — so treat a parseable list as success.
  if (!res.ok && servers.length === 0) {
    return { ok: false, servers, error: res.stderr.trim() || "claude mcp list failed" };
  }
  return { ok: true, servers };
}

/** Get one server's details (scope, type, command/url, args). */
export async function getMcp(
  name: string,
): Promise<{ ok: boolean; detail?: McpServerDetail; error?: string }> {
  const res = await claudeMcp(["get", name]);
  if (!res.ok && !res.stdout.trim()) {
    return { ok: false, error: res.stderr.trim() || "not found" };
  }
  const detail: McpServerDetail = { name, target: "", status: "unknown" };
  for (const raw of res.stdout.split("\n")) {
    const line = raw.trim();
    const kv = /^([A-Za-z]+):\s+(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const val = kv[2].trim();
    if (key === "scope") detail.scope = val;
    else if (key === "status") detail.status = parseStatus(val);
    else if (key === "type")
      detail.transport = val.toLowerCase() as McpServerDetail["transport"];
    else if (key === "command") detail.command = val;
    else if (key === "args") detail.args = val;
    else if (key === "url") {
      detail.url = val;
      detail.target = val;
    }
  }
  if (!detail.target)
    detail.target = detail.url ?? [detail.command, detail.args].filter(Boolean).join(" ");
  return { ok: true, detail };
}

export type AddMcpInput = {
  name: string;
  transport?: "http" | "sse" | "stdio";
  /** URL (http/sse) or command (stdio). */
  target: string;
  /** Extra args for a stdio command. */
  args?: string[];
  /** Env vars as KEY=value. */
  env?: string[];
  /** HTTP headers, e.g. "Authorization: Bearer x". */
  headers?: string[];
  /** local | user | project (default local). */
  scope?: "local" | "user" | "project";
};

/** Add (install) an MCP server. */
export async function addMcp(
  input: AddMcpInput,
): Promise<{ ok: boolean; message: string; error?: string }> {
  const args = ["add"];
  if (input.scope) args.push("--scope", input.scope);
  if (input.transport) args.push("--transport", input.transport);
  for (const e of input.env ?? []) args.push("-e", e);
  for (const h of input.headers ?? []) args.push("--header", h);
  args.push(input.name, input.target);
  // stdio subprocess args go after a `--` separator.
  if (input.args && input.args.length) args.push("--", ...input.args);
  const res = await claudeMcp(args);
  if (!res.ok) {
    return { ok: false, message: "", error: res.stderr.trim() || "add failed" };
  }
  return { ok: true, message: res.stdout.trim() };
}

/** Remove (uninstall) an MCP server. */
export async function removeMcp(
  name: string,
): Promise<{ ok: boolean; message: string; error?: string }> {
  const res = await claudeMcp(["remove", name]);
  if (!res.ok) {
    return { ok: false, message: "", error: res.stderr.trim() || "remove failed" };
  }
  return { ok: true, message: res.stdout.trim() };
}
