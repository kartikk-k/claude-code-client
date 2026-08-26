# Claude Client

A local web client for **Claude Code**. It reads your session data straight from
`~/.claude` and lets you browse projects, read transcripts (with tool calls and
sub-agents rendered), and send new messages — a comfortable UI instead of the
terminal.

Everything runs on your machine. Nothing leaves your computer except the calls
the `claude` CLI already makes on your behalf.

## How it works

```
~/.claude/projects/**          ┌──────────────────────┐        ┌────────────────┐
  <session>.jsonl        ─────▶ │  Bun + Hono server   │ ─────▶ │  Next.js app   │
  agent-*.jsonl                 │  (reads data,        │  API   │  (renders +    │
                                │   shells out to      │        │   interacts)   │
`claude` CLI  ◀──── spawn ───── │   `claude -p …`)     │        └────────────────┘
                                └──────────────────────┘
```

- **Server** (`/server`, Bun + Hono) — parses the JSONL transcripts into
  structured messages/tools/sub-agents and exposes them over a small HTTP API.
  To send a message it spawns `claude -p --resume <sessionId> --output-format
  stream-json …` in the session's working directory and streams the response
  back as SSE. Verified against Claude Code **2.1.212**.
- **Client** (`/src`, Next.js 16 + React 19 + Tailwind v4) — the chat UI, reusing
  the Aside design system: session sidebar, conversation renderer, collapsible
  sub-agents panel, and a rich composer.

## Run it

```bash
# one command — starts the data server (:4317) and the client (:3000)
./start.sh
```

Or run the two halves separately:

```bash
bun run server    # data server on :4317
bun run client    # Next.js on :3000
```

Requires [Bun](https://bun.sh) and the `claude` CLI on your `PATH`.

## API (server)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects` | List projects (decoded cwd, session count, last activity) |
| GET | `/api/projects/:id/sessions` | Sessions in a project |
| GET | `/api/projects/:pid/sessions/:sid` | Full parsed transcript + sub-agents |
| GET | `/api/projects/:pid/sessions/:sid/agents` | Sub-agent transcripts only |
| POST | `/api/message` | Send a prompt; streams `stream-json` back as SSE |

`POST /api/message` body: `{ cwd, sessionId?, newSessionId?, prompt, images?, model?, permissionMode? }`.

## Composer — beyond the terminal

The composer adds things the stock CLI has no UI for:

- **Image drop & paste** — drop or paste screenshots straight in.
- **Context annotations** — inline `@file` and `<context>` chips, tag-like.
- **`/` menu** — thread actions + skills.
- **`@` menu** — fuzzy file tagging.
- **`+` menu** — add files/folders, plan mode, plugins/MCPs.
- **Permission modes** — Ask for approval · Approve for me · Full access.

## Safety

The server never uses `--dangerously-skip-permissions`. Message sends default to
`--permission-mode acceptEdits`; you choose the mode per-send in the composer.
