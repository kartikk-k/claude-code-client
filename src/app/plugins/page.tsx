"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PLUGINS, type Plugin } from "./catalog";
import { PluginTile } from "./components/PluginTile";
import {
  SearchIcon,
  PlusIcon,
  XIcon,
  ChevronDownIcon,
  RefreshIcon,
  TrashIcon,
  AlertIcon,
} from "../chat/components/icons";
import {
  api,
  type McpServer,
  type McpStatus,
  type AddMcpInput,
} from "../lib/api";

/**
 * Plugins marketplace — a collection of MCP servers Claude Code can connect to.
 *
 * This page is now wired to the REAL `claude mcp` backend via `api.mcp*`. The
 * live `api.mcpList()` result is the single source of truth for what is
 * "installed" (not the catalog's `installed` flag, not the prefs store):
 *  - "Installed" section lists real servers with their live connection status
 *    and a working Remove button.
 *  - "Add MCP server" reveals an inline form for a real custom install.
 *  - "Available" lists catalog plugins not already installed, each with a real
 *    Install button that derives an AddMcpInput from the catalog `command`.
 * Every control performs a real API call or a real local UI action.
 */

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/** Live-status → color + label. Hexes are the app's status palette. */
const STATUS_META: Record<McpStatus, { color: string; label: string }> = {
  connected: { color: "#3fb950", label: "Connected" },
  needs_auth: { color: "#d29922", label: "Needs auth" },
  failed: { color: "#f85149", label: "Failed" },
  unknown: { color: "#8b949e", label: "Unknown" },
};

/**
 * Turn a `claude mcp add ...` command string into an `AddMcpInput`. Forgiving:
 * returns null when it can't find a name + target so callers can fall back.
 *
 *  - Drops the leading `claude mcp add`; first non-flag token is the `name`.
 *  - `--transport|-t <t>` sets transport.
 *  - `-e KEY=val` → env[]; `--header|-H <val>` → headers[].
 *  - A `--` separator means everything after it is a stdio command: the first
 *    token becomes `target`, the rest become `args[]`, transport `stdio`.
 *  - Otherwise the first `http(s)://…` token is `target` (transport defaults to
 *    http when a URL starts with http and none was given).
 *  - Always `scope: "local"`.
 */
export function parseInstallCommand(cmd: string): AddMcpInput | null {
  const tokens = cmd.trim().split(/\s+/);
  // Drop a leading `claude mcp add` (be lenient about exact prefix).
  let i = 0;
  if (tokens[i] === "claude") i++;
  if (tokens[i] === "mcp") i++;
  if (tokens[i] === "add") i++;

  let name: string | undefined;
  let transport: AddMcpInput["transport"] | undefined;
  let target: string | undefined;
  const args: string[] = [];
  const env: string[] = [];
  const headers: string[] = [];

  for (; i < tokens.length; i++) {
    const t = tokens[i];

    if (t === "--") {
      // Everything after `--` is a stdio command.
      const rest = tokens.slice(i + 1);
      if (rest.length > 0) {
        target = rest[0];
        args.push(...rest.slice(1));
        transport = "stdio";
      }
      break;
    }

    if (t === "--transport" || t === "-t") {
      transport = tokens[++i] as AddMcpInput["transport"];
      continue;
    }
    if (t === "-e" || t === "--env") {
      const v = tokens[++i];
      if (v) env.push(v);
      continue;
    }
    if (t === "--header" || t === "-H") {
      const v = tokens[++i];
      if (v) headers.push(v.replace(/^["']|["']$/g, ""));
      continue;
    }
    if (t.startsWith("-")) {
      // Unknown flag — skip it (leave any value token to be handled below).
      continue;
    }

    // Positional token.
    if (!name) {
      name = t;
      continue;
    }
    if (!target && /^https?:\/\//i.test(t)) {
      target = t;
      continue;
    }
  }

  if (!transport && target && /^https?:\/\//i.test(target)) transport = "http";

  if (!name || !target) return null;
  return {
    name,
    transport,
    target,
    args: args.length ? args : undefined,
    env: env.length ? env : undefined,
    headers: headers.length ? headers : undefined,
    scope: "local",
  };
}

/** Derive an AddMcpInput for a catalog plugin, with a forgiving fallback. */
function inputForPlugin(plugin: Plugin): AddMcpInput {
  const parsed = parseInstallCommand(plugin.command);
  if (parsed) return parsed;
  // Best-guess fallback: first URL-ish token in the command, else the command.
  const urlMatch = plugin.command.match(/https?:\/\/\S+/i);
  return {
    name: plugin.id,
    transport: plugin.transport,
    target: urlMatch?.[0] ?? plugin.command,
    scope: "local",
  };
}

/** Case-insensitive name match between a catalog plugin and a live server. */
function matchPlugin(serverName: string): Plugin | undefined {
  const n = serverName.toLowerCase();
  return PLUGINS.find(
    (p) => p.name.toLowerCase() === n || p.id.toLowerCase() === n
  );
}

export default function PluginsPage() {
  const [query, setQuery] = useState("");

  // Live server state — the source of truth for "installed".
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Per-item in-flight names (install or remove) for spinners.
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const setBusyName = useCallback((name: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });
  }, []);

  // Per-item install/remove errors keyed by name.
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const setItemError = useCallback((name: string, msg: string | null) => {
    setItemErrors((prev) => {
      const next = { ...prev };
      if (msg) next[name] = msg;
      else delete next[name];
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await api.mcpList();
      if (res.ok) setServers(res.servers);
      else setListError(res.error || "Failed to load MCP servers.");
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load MCP servers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Fast lookup of installed server names (lowercased).
  const installedNames = useMemo(
    () => new Set(servers.map((s) => s.name.toLowerCase())),
    [servers]
  );

  const install = useCallback(
    async (name: string, input: AddMcpInput): Promise<boolean> => {
      setBusyName(name, true);
      setItemError(name, null);
      try {
        const res = await api.mcpAdd(input);
        if (!res.ok) {
          setItemError(name, res.error || "Install failed.");
          return false;
        }
        await refresh();
        return true;
      } finally {
        setBusyName(name, false);
      }
    },
    [refresh, setBusyName, setItemError]
  );

  const remove = useCallback(
    async (name: string) => {
      setBusyName(name, true);
      setItemError(name, null);
      try {
        const res = await api.mcpRemove(name);
        if (!res.ok) {
          setItemError(name, res.error || "Remove failed.");
          return;
        }
        await refresh();
      } finally {
        setBusyName(name, false);
      }
    },
    [refresh, setBusyName, setItemError]
  );

  // Catalog filtered by the search box (title / tagline / category).
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      !q
        ? PLUGINS
        : PLUGINS.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.tagline.toLowerCase().includes(q) ||
              p.category.toLowerCase().includes(q)
          ),
    [q]
  );

  // Available = catalog plugins NOT already installed (matched by name).
  const available = useMemo(
    () =>
      matches.filter(
        (p) =>
          !installedNames.has(p.name.toLowerCase()) &&
          !installedNames.has(p.id.toLowerCase())
      ),
    [matches, installedNames]
  );

  return (
    <>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.5px] text-text-strong">
            Plugins
          </h1>
          <p className="mt-1 text-[14px] leading-5 text-text-secondary">
            Connect Claude Code to MCP servers for extra tools and context.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-[11px] border border-control-border bg-control-bg px-3 text-[13px] font-medium text-text-primary transition-colors hover:bg-nav-active-bg/60 disabled:opacity-60"
        >
          <RefreshIcon className={cx("size-4 icon-muted", loading && "animate-spin")} />
          Refresh
        </button>
      </header>

      {/* Add MCP server */}
      <AddServerForm
        onAdd={install}
        installedNames={installedNames}
      />

      {/* Search */}
      <div className="mb-8 flex h-12 items-center gap-2.5 rounded-[14px] border border-control-border bg-control-bg px-4">
        <SearchIcon className="size-4 icon-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search plugins"
          className="min-w-0 flex-1 bg-transparent text-[14px] leading-5 text-text-primary outline-none placeholder:text-text-faint"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="flex size-6 items-center justify-center rounded-full icon-muted transition-colors hover:bg-nav-active-bg/60"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* Installed — driven by the live server list */}
      <section className="mb-10">
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-medium leading-5 text-text-primary">
          Installed
          {servers.length > 0 ? (
            <span className="text-text-faint">{servers.length}</span>
          ) : null}
        </h2>

        {listError ? (
          <div className="flex items-center gap-2.5 rounded-[14px] border border-card-border bg-row-bg px-4 py-3 text-[13px] text-text-secondary">
            <AlertIcon className="size-4 shrink-0" style={{ color: "#f85149" }} />
            <span className="min-w-0 flex-1">{listError}</span>
            <button
              type="button"
              onClick={refresh}
              className="shrink-0 text-[13px] font-medium text-link transition-opacity hover:opacity-80"
            >
              Retry
            </button>
          </div>
        ) : loading && servers.length === 0 ? (
          <div className="flex items-center gap-2 rounded-[14px] border border-card-border bg-row-bg px-4 py-6 text-[13px] text-text-faint">
            <Spinner />
            Loading installed servers…
          </div>
        ) : servers.length === 0 ? (
          <p className="rounded-[14px] border border-card-border bg-row-bg px-4 py-6 text-center text-[14px] text-text-faint">
            No MCP servers installed yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {servers.map((s) => (
              <InstalledCard
                key={s.name}
                server={s}
                busy={busy.has(s.name)}
                error={itemErrors[s.name]}
                onRemove={() => remove(s.name)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Available — catalog plugins not already installed */}
      <section className="mb-10">
        <h2 className="mb-3 text-[15px] font-medium leading-5 text-text-primary">
          Available
        </h2>
        {available.length > 0 ? (
          <div className="overflow-hidden rounded-[16px] border border-card-border bg-row-bg divide-y divide-row-divider">
            {available.map((p) => (
              <AvailableRow
                key={p.id}
                plugin={p}
                busy={busy.has(inputForPlugin(p).name)}
                error={itemErrors[inputForPlugin(p).name]}
                onInstall={() => {
                  const input = inputForPlugin(p);
                  install(input.name, input);
                }}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-[14px] border border-card-border bg-row-bg px-4 py-6 text-center text-[14px] text-text-faint">
            {q
              ? `No available plugins match “${query}”.`
              : "Everything in the catalog is installed."}
          </p>
        )}
      </section>
    </>
  );
}

/* --------------------------------- pieces -------------------------------- */

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent icon-muted",
        className
      )}
      aria-hidden="true"
    />
  );
}

function StatusDot({ status }: { status: McpStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.unknown;
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: meta.color }}
      />
      <span className="text-[12px] leading-4" style={{ color: meta.color }}>
        {meta.label}
      </span>
    </span>
  );
}

function TransportChip({ transport }: { transport?: string }) {
  if (!transport) return null;
  return (
    <span className="rounded-full border border-control-border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
      {transport}
    </span>
  );
}

function InstalledCard({
  server,
  busy,
  error,
  onRemove,
}: {
  server: McpServer;
  busy: boolean;
  error?: string;
  onRemove: () => void;
}) {
  const plugin = matchPlugin(server.name);
  const mark = server.name.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "MC";
  return (
    <div
      className={cx(
        "flex flex-col gap-2 rounded-[14px] border border-card-border bg-row-bg p-3 transition-opacity",
        busy && "pointer-events-none opacity-60"
      )}
    >
      <div className="flex items-center gap-3">
        <PluginTile
          color={plugin?.color ?? "#5A5A5A"}
          mark={plugin?.mark ?? mark}
          logo={plugin?.logo}
          logoBg={plugin?.logoBg}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium leading-5 text-text-strong">
            {server.name}
          </div>
          <div className="truncate font-mono text-[12px] leading-4 text-text-secondary">
            {server.target}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label={`Remove ${server.name}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-control-border text-text-secondary transition-colors hover:bg-nav-active-bg/60 hover:text-text-strong disabled:opacity-60"
        >
          {busy ? <Spinner /> : <TrashIcon className="size-4" />}
        </button>
      </div>
      <div className="flex items-center gap-2 pl-[52px]">
        <StatusDot status={server.status} />
        <TransportChip transport={server.transport} />
      </div>
      {error ? (
        <p className="pl-[52px] text-[12px] leading-4" style={{ color: "#f85149" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AvailableRow({
  plugin,
  busy,
  error,
  onInstall,
}: {
  plugin: Plugin;
  busy: boolean;
  error?: string;
  onInstall: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <Link
          href={`/plugins/${plugin.id}`}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <PluginTile
            color={plugin.color}
            mark={plugin.mark}
            logo={plugin.logo}
            logoBg={plugin.logoBg}
            size={38}
          />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-medium leading-5 text-text-strong">
              {plugin.name}
            </div>
            <div className="truncate text-[13px] leading-[18px] text-text-secondary">
              {plugin.tagline}
            </div>
          </div>
        </Link>
        <button
          type="button"
          onClick={onInstall}
          disabled={busy}
          aria-label={`Install ${plugin.name}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-control-border text-text-secondary transition-colors hover:bg-nav-active-bg/60 hover:text-text-strong disabled:opacity-60"
        >
          {busy ? <Spinner /> : <PlusIcon className="size-4" />}
        </button>
      </div>
      {error ? (
        <p className="pl-[50px] text-[12px] leading-4" style={{ color: "#f85149" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Inline "Add MCP server" form for a real custom install. Collapsed to a button
 * until opened. On submit it derives an AddMcpInput and calls the shared install
 * handler; a `--` command target is parsed into a stdio command + args.
 */
function AddServerForm({
  onAdd,
  installedNames,
}: {
  onAdd: (name: string, input: AddMcpInput) => Promise<boolean>;
  installedNames: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"http" | "sse" | "stdio">("http");
  const [target, setTarget] = useState("");
  const [scope, setScope] = useState<"local" | "user" | "project">("local");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setTransport("http");
    setTarget("");
    setScope("local");
    setError(null);
  };

  const submit = async () => {
    setError(null);
    const trimmedName = name.trim();
    const trimmedTarget = target.trim();
    if (!trimmedName) return setError("Name is required.");
    if (!trimmedTarget) return setError("Target URL or command is required.");
    if (installedNames.has(trimmedName.toLowerCase()))
      return setError(`A server named “${trimmedName}” already exists.`);

    // For stdio, treat the target as a command line: first token is the
    // command, the rest are args. For http/sse it's a URL.
    let input: AddMcpInput;
    if (transport === "stdio") {
      const parts = trimmedTarget.split(/\s+/);
      input = {
        name: trimmedName,
        transport,
        target: parts[0],
        args: parts.length > 1 ? parts.slice(1) : undefined,
        scope,
      };
    } else {
      input = { name: trimmedName, transport, target: trimmedTarget, scope };
    }

    setSubmitting(true);
    try {
      const ok = await onAdd(trimmedName, input);
      if (ok) {
        // Parent refreshed and this server is now installed — close the form.
        reset();
        setOpen(false);
      } else {
        // Install failed; keep the form open and surface the error inline.
        setError("Couldn't add that server — check the name and target.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add server.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-6 flex h-10 w-full items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-control-border bg-control-bg/50 text-[13px] font-medium text-text-secondary transition-colors hover:bg-nav-active-bg/40 hover:text-text-strong"
      >
        <PlusIcon className="size-4" />
        Add MCP server
      </button>
    );
  }

  return (
    <div className="mb-6 rounded-[16px] border border-card-border bg-row-bg p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[14px] font-medium text-text-strong">Add MCP server</h2>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          aria-label="Cancel"
          className="flex size-7 items-center justify-center rounded-full icon-muted transition-colors hover:bg-nav-active-bg/60"
        >
          <ChevronDownIcon className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[12px] text-text-secondary">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-server"
              className="h-9 rounded-[10px] border border-control-border bg-control-bg px-3 text-[13px] text-text-primary outline-none placeholder:text-text-faint focus:border-text-faint"
            />
          </label>
          <label className="flex flex-col gap-1 sm:w-32">
            <span className="text-[12px] text-text-secondary">Transport</span>
            <select
              value={transport}
              onChange={(e) =>
                setTransport(e.target.value as "http" | "sse" | "stdio")
              }
              className="h-9 rounded-[10px] border border-control-border bg-control-bg px-2.5 text-[13px] text-text-primary outline-none focus:border-text-faint"
            >
              <option value="http">http</option>
              <option value="sse">sse</option>
              <option value="stdio">stdio</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:w-32">
            <span className="text-[12px] text-text-secondary">Scope</span>
            <select
              value={scope}
              onChange={(e) =>
                setScope(e.target.value as "local" | "user" | "project")
              }
              className="h-9 rounded-[10px] border border-control-border bg-control-bg px-2.5 text-[13px] text-text-primary outline-none focus:border-text-faint"
            >
              <option value="local">local</option>
              <option value="user">user</option>
              <option value="project">project</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-text-secondary">
            {transport === "stdio" ? "Command" : "Target URL"}
          </span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={
              transport === "stdio"
                ? "npx -y @modelcontextprotocol/server-filesystem ~/Projects"
                : "https://example.com/mcp"
            }
            className="h-9 rounded-[10px] border border-control-border bg-control-bg px-3 font-mono text-[12.5px] text-text-primary outline-none placeholder:text-text-faint focus:border-text-faint"
          />
        </label>

        {error ? (
          <p className="text-[12px] leading-4" style={{ color: "#f85149" }}>
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            className="flex h-9 items-center rounded-[10px] border border-control-border bg-control-bg px-3 text-[13px] font-medium text-text-primary transition-colors hover:bg-nav-active-bg/60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex h-9 items-center gap-1.5 rounded-[10px] bg-btn-solid-bg px-3.5 text-[13px] font-semibold text-btn-solid-text transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? <Spinner className="!icon-strong" /> : <PlusIcon className="size-4" />}
            Add server
          </button>
        </div>
      </div>
    </div>
  );
}
