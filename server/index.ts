/**
 * Claude Client local server (Bun + Hono).
 * A read layer over ~/.claude data + a write path that shells out to the
 * `claude` CLI to drive sessions. Runs on :4317 by default.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  listProjects,
  listSessions,
  getSession,
} from "./claude-data.ts";
import { sendMessage } from "./claude-run.ts";

const app = new Hono();
app.use("*", cors());

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/projects", async (c) => {
  return c.json(await listProjects());
});

app.get("/api/projects/:id/sessions", async (c) => {
  return c.json(await listSessions(c.req.param("id")));
});

app.get("/api/projects/:pid/sessions/:sid", async (c) => {
  const t = await getSession(c.req.param("pid"), c.req.param("sid"));
  if (!t) return c.json({ error: "not found" }, 404);
  return c.json(t);
});

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
};
