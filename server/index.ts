/**
 * Claude Client local server (Bun + Hono).
 * A read layer over ~/.claude data + a write path that shells out to the
 * `claude` CLI to drive sessions. Runs on :4317 by default.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createBunWebSocket } from "hono/bun";
import { homedir } from "node:os";
import { join } from "node:path";
import { rename, mkdir } from "node:fs/promises";
import {
  listProjects,
  listSessions,
  getSession,
  PROJECTS_DIR,
} from "./claude-data.ts";
import { sendMessage } from "./claude-run.ts";
import { getMeta, setMeta } from "./meta.ts";
import { readConfig, writeConfig } from "./config.ts";
import { gitStatus, gitDiff } from "./git.ts";
import { listDir, readFileContent } from "./files.ts";
import { ptyEvents, PTY_AVAILABLE } from "./pty.ts";

const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono();
app.use("*", cors());

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/projects", async (c) => {
  return c.json(await listProjects());
});

app.get("/api/projects/:id/sessions", async (c) => {
  const sessions = await listSessions(c.req.param("id"));
  // Fold sidecar meta into each summary: pin/archive flags + custom title.
  const merged = await Promise.all(
    sessions.map(async (s) => {
      const m = await getMeta(s.id);
      return {
        ...s,
        pinned: m.pinned ?? false,
        archived: m.archived ?? false,
        customTitle: m.customTitle,
        title: m.customTitle || s.title,
      };
    })
  );
  return c.json(merged);
});

app.get("/api/projects/:pid/sessions/:sid", async (c) => {
  const t = await getSession(c.req.param("pid"), c.req.param("sid"));
  if (!t) return c.json({ error: "not found" }, 404);
  const m = await getMeta(t.id);
  return c.json({
    ...t,
    pinned: m.pinned ?? false,
    archived: m.archived ?? false,
    customTitle: m.customTitle,
    title: m.customTitle || t.title,
  });
});

/** Update session metadata (title / pinned / archived) in the sidecar store. */
app.patch("/api/projects/:pid/sessions/:sid", async (c) => {
  const pid = c.req.param("pid");
  const sid = c.req.param("sid");
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string;
    pinned?: boolean;
    archived?: boolean;
  };
  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.customTitle = body.title;
  if (typeof body.pinned === "boolean") patch.pinned = body.pinned;
  if (typeof body.archived === "boolean") {
    patch.archived = body.archived;
    patch.archivedAt = body.archived ? Date.now() : undefined;
  }
  const m = await setMeta(sid, patch);

  // Return the updated SessionSummary (re-read the base summary for accuracy).
  const sessions = await listSessions(pid);
  const base = sessions.find((s) => s.id === sid);
  if (!base) return c.json({ error: "not found" }, 404);
  return c.json({
    ...base,
    pinned: m.pinned ?? false,
    archived: m.archived ?? false,
    customTitle: m.customTitle,
    title: m.customTitle || base.title,
  });
});

/** Soft-delete: move <sid>.jsonl into ~/.claude-client/trash/. Never hard-delete. */
app.delete("/api/projects/:pid/sessions/:sid", async (c) => {
  const pid = c.req.param("pid");
  const sid = c.req.param("sid");
  const src = join(PROJECTS_DIR, pid, `${sid}.jsonl`);
  const trashDir = join(homedir(), ".claude-client", "trash");
  await mkdir(trashDir, { recursive: true });
  // Namespace by project + timestamp so trashed files never collide.
  const dest = join(trashDir, `${pid}__${sid}.${Date.now()}.jsonl`);
  try {
    await rename(src, dest);
  } catch {
    /* already gone — treat as success (idempotent delete) */
  }
  return c.body(null, 204);
});

/* ------------------------------- config ------------------------------- */

app.get("/api/config", async (c) => c.json(await readConfig()));

app.put("/api/config", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  return c.json(await writeConfig(body));
});

/* --------------------------------- git -------------------------------- */

app.get("/api/git/status", async (c) => {
  const cwd = c.req.query("cwd");
  if (!cwd) return c.json({ error: "cwd required" }, 400);
  return c.json(await gitStatus(cwd));
});

app.get("/api/git/diff", async (c) => {
  const cwd = c.req.query("cwd");
  const file = c.req.query("file");
  if (!cwd || !file) return c.json({ error: "cwd and file required" }, 400);
  return c.json(await gitDiff(cwd, file));
});

/* -------------------------------- files ------------------------------- */

app.get("/api/files", async (c) => {
  const cwd = c.req.query("cwd");
  if (!cwd) return c.json({ error: "cwd required" }, 400);
  try {
    return c.json(await listDir(cwd, c.req.query("path") ?? ""));
  } catch (err) {
    return c.json({ error: String(err) }, 400);
  }
});

app.get("/api/files/content", async (c) => {
  const cwd = c.req.query("cwd");
  const path = c.req.query("path");
  if (!cwd || !path) return c.json({ error: "cwd and path required" }, 400);
  try {
    return c.json(await readFileContent(cwd, path));
  } catch (err) {
    return c.json({ error: String(err) }, 400);
  }
});

/* --------------------------------- pty -------------------------------- */

app.get(
  "/api/pty",
  upgradeWebSocket((c) => {
    if (!PTY_AVAILABLE) {
      // Degrade gracefully: refuse the socket, keep the server alive.
      return { onOpen: (_e, ws) => ws.close(1011, "pty unavailable") };
    }
    const cwd = c.req.query("cwd") ?? "";
    const cols = Number(c.req.query("cols")) || 80;
    const rows = Number(c.req.query("rows")) || 24;
    return ptyEvents(cwd, cols, rows);
  })
);

app.get("/api/projects/:pid/sessions/:sid/agents", async (c) => {
  const t = await getSession(c.req.param("pid"), c.req.param("sid"));
  if (!t) return c.json({ error: "not found" }, 404);
  return c.json(t.agents);
});

/**
 * Send a prompt to a session. Streams the CLI's stream-json output back as SSE.
 * Body: { cwd: string, sessionId?: string, prompt: string, images?: string[] }
 */
app.post("/api/message", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.prompt !== "string" || typeof body.cwd !== "string") {
    return c.json({ error: "prompt and cwd are required" }, 400);
  }
  const stream = sendMessage({
    cwd: body.cwd,
    sessionId: body.sessionId,
    newSessionId: body.newSessionId,
    prompt: body.prompt,
    images: Array.isArray(body.images) ? body.images : [],
    model: body.model,
    permissionMode: body.permissionMode,
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

const port = Number(process.env.PORT ?? 4317);
console.log(`[claude-client] server listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
  // The /api/message SSE stream stays open while the `claude` CLI thinks — which
  // easily exceeds Bun's default 10s idle timeout and would otherwise abort the
  // response mid-turn. Raise it to Bun's maximum (255s).
  idleTimeout: 255,
  // Bun WebSocket handler from hono/bun; drives the /api/pty upgrade.
  websocket,
};
