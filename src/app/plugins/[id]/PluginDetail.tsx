"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Plugin } from "../catalog";
import { PluginTile } from "../components/PluginTile";
import {
  ChevronRightIcon,
  ArrowUpIcon,
  CopyIcon,
  CheckIcon,
  WrenchIcon,
  TrashIcon,
} from "../../chat/components/icons";
import {
  api,
  type McpServerDetail,
  type McpStatus,
  type AddMcpInput,
} from "../../lib/api";
import { parseInstallCommand } from "../page";

/**
 * Plugin detail page — hero (mark, name, tagline, actions), a live status
 * banner, example prompts, the tools this MCP server exposes, an install
 * snippet, and an info table.
 *
 * Now wired to the REAL `claude mcp` backend: on mount it calls `api.mcpGet`
 * for this plugin's server name to learn whether it's actually installed and
 * its live status/scope/transport. Install → `api.mcpAdd`, Uninstall →
 * `api.mcpRemove`, each followed by a refetch. Copy actually writes to the
 * clipboard. Every control performs a real action.
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

/** Derive an AddMcpInput for this plugin, with a forgiving fallback. */
function inputForPlugin(plugin: Plugin): AddMcpInput {
  const parsed = parseInstallCommand(plugin.command);
  if (parsed) return parsed;
  const urlMatch = plugin.command.match(/https?:\/\/\S+/i);
  return {
    name: plugin.id,
    transport: plugin.transport,
    target: urlMatch?.[0] ?? plugin.command,
    scope: "local",
  };
}

export function PluginDetail({ plugin }: { plugin: Plugin }) {
  // Live install state for this plugin's server (matched by name).
  const [detail, setDetail] = useState<McpServerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Install/uninstall action state.
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  const installed = detail != null;

  const load = useCallback(async () => {
    setLoading(true);
    setBannerError(null);
    try {
      const res = await api.mcpGet(plugin.name);
      // The endpoint answers ok:false / no detail when the server isn't
      // installed — that's a normal "not installed" state, not an error.
      setDetail(res.ok && res.detail ? res.detail : null);
    } catch (e) {
      setBannerError(
        e instanceof Error ? e.message : "Couldn't check install status."
      );
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [plugin.name]);

  useEffect(() => {
    load();
  }, [load]);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(plugin.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  const install = async () => {
    setActing(true);
    setActionError(null);
    try {
      const res = await api.mcpAdd(inputForPlugin(plugin));
      if (!res.ok) {
        setActionError(res.error || "Install failed.");
        return;
      }
      await load();
    } finally {
      setActing(false);
    }
  };

  const uninstall = async () => {
    setActing(true);
    setActionError(null);
    try {
      const res = await api.mcpRemove(detail?.name ?? plugin.name);
      if (!res.ok) {
        setActionError(res.error || "Remove failed.");
        return;
      }
      await load();
    } finally {
      setActing(false);
    }
  };

  return (
    <>
      {/* Breadcrumb */}
      <nav className="mb-8 flex items-center gap-1.5 text-[13px] leading-5 text-text-secondary">
        <Link href="/plugins" className="transition-colors hover:text-text-primary">
          Plugins
        </Link>
        <ChevronRightIcon className="size-3.5 icon-faint" />
        <span className="text-text-primary">{plugin.name}</span>
      </nav>

      {/* Hero */}
      <div className="mb-6">
        <PluginTile
          color={plugin.color}
          mark={plugin.mark}
          logo={plugin.logo}
          logoBg={plugin.logoBg}
          size={64}
        />
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold leading-8 tracking-[-0.4px] text-text-strong">
              {plugin.name}
            </h1>
            <p className="mt-1 text-[15px] leading-6 text-text-secondary">
              {plugin.tagline}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            <button
              type="button"
              onClick={copyCommand}
              className="flex h-9 items-center gap-1.5 rounded-[11px] border border-control-border bg-control-bg px-3 text-[13px] font-medium text-text-primary transition-colors hover:bg-nav-active-bg/60"
            >
              {copied ? (
                <CheckIcon className="size-4 icon-strong" />
              ) : (
                <CopyIcon className="size-4 icon-muted" />
              )}
              {copied ? "Copied" : "Copy command"}
            </button>
            {installed ? (
              <button
                type="button"
                onClick={uninstall}
                disabled={acting}
                className="flex h-9 items-center gap-1.5 rounded-[11px] border border-control-border bg-control-bg px-3.5 text-[13px] font-semibold text-text-primary transition-colors hover:bg-nav-active-bg/60 disabled:opacity-60"
              >
                {acting ? <Spinner /> : <TrashIcon className="size-4 icon-muted" />}
                {acting ? "Removing…" : "Uninstall"}
              </button>
            ) : (
              <button
                type="button"
                onClick={install}
                disabled={acting || loading}
                className="flex h-9 items-center gap-1.5 rounded-[11px] bg-btn-solid-bg px-3.5 text-[13px] font-semibold text-btn-solid-text transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {acting ? <Spinner className="!icon-strong" /> : null}
                {acting ? "Installing…" : "Add plugin"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live status banner */}
      <StatusBanner
        loading={loading}
        installed={installed}
        detail={detail}
        error={bannerError}
        actionError={actionError}
        onRetry={load}
      />

      {/* Example prompts */}
      <section className="mb-8">
        <div
          className="rounded-[16px] p-4"
          style={{
            background: `linear-gradient(150deg, ${plugin.color}1f, transparent 80%)`,
          }}
        >
          <div className="flex flex-col gap-2">
            {plugin.examples.map((ex, i) => (
              <div
                key={i}
                className="group flex items-center gap-3 rounded-[12px] border border-card-border bg-row-bg px-4 py-3 text-left"
              >
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="shrink-0 text-[13px] font-semibold text-text-primary">
                    {plugin.name}
                  </span>
                  <span className="text-[13px] leading-5 text-text-secondary">
                    {ex}
                  </span>
                </span>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-control-border text-text-faint">
                  <ArrowUpIcon className="size-3.5 rotate-90" />
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-4 text-[14px] leading-6 text-text-secondary">
          {plugin.description}
        </p>
      </section>

      {/* Tools */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-medium leading-5 text-text-primary">
          Tools
          <span className="text-text-faint">{plugin.tools.length}</span>
        </h2>
        <div className="overflow-hidden rounded-[16px] border border-card-border bg-row-bg divide-y divide-row-divider">
          {plugin.tools.map((t) => (
            <div key={t.name} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-control-bg icon-muted">
                <WrenchIcon className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="font-mono text-[13px] leading-5 text-text-strong">
                  {t.name}
                </div>
                <p className="text-[13px] leading-[18px] text-text-secondary">
                  {t.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Install snippet */}
      <section className="mb-8">
        <h2 className="mb-3 text-[15px] font-medium leading-5 text-text-primary">
          Install
        </h2>
        <div className="flex items-center gap-3 rounded-[14px] border border-card-border bg-code-bg px-4 py-3">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12.5px] leading-5 text-code-text">
            {plugin.command}
          </code>
          <button
            type="button"
            onClick={copyCommand}
            aria-label="Copy install command"
            className="flex size-8 shrink-0 items-center justify-center rounded-[9px] icon-muted transition-colors hover:bg-nav-active-bg/60 hover:opacity-100"
          >
            {copied ? (
              <CheckIcon className="size-4 icon-strong" />
            ) : (
              <CopyIcon className="size-4" />
            )}
          </button>
        </div>
      </section>

      {/* Information */}
      <section>
        <h2 className="mb-3 text-[15px] font-medium leading-5 text-text-primary">
          Information
        </h2>
        <dl className="grid grid-cols-[130px_1fr] gap-y-3 text-[13px] leading-5">
          <InfoRow label="Developer" value={plugin.developer} />
          <InfoRow label="Category" value={plugin.category} />
          <InfoRow
            label="Transport"
            value={(detail?.transport ?? plugin.transport).toUpperCase()}
          />
          {installed && detail?.scope ? (
            <InfoRow label="Scope" value={detail.scope} />
          ) : null}
          <InfoRow label="Version" value={plugin.version} />
          <InfoRow
            label="Website"
            value={
              plugin.website ? (
                <a
                  href={plugin.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link transition-opacity hover:opacity-80"
                >
                  {plugin.website.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                "—"
              )
            }
          />
        </dl>
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

function StatusBanner({
  loading,
  installed,
  detail,
  error,
  actionError,
  onRetry,
}: {
  loading: boolean;
  installed: boolean;
  detail: McpServerDetail | null;
  error: string | null;
  actionError: string | null;
  onRetry: () => void;
}) {
  // Network error checking install status.
  if (error) {
    return (
      <div className="mb-8 flex items-center gap-2.5 rounded-[14px] border border-card-border bg-row-bg px-4 py-3 text-[13px] text-text-secondary">
        <span className="size-2 shrink-0 rounded-full" style={{ background: "#f85149" }} />
        <span className="min-w-0 flex-1">{error}</span>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-[13px] font-medium text-link transition-opacity hover:opacity-80"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mb-8 flex items-center gap-2 rounded-[14px] border border-card-border bg-row-bg px-4 py-3 text-[13px] text-text-faint">
        <Spinner />
        Checking install status…
      </div>
    );
  }

  if (!installed) {
    return (
      <div className="mb-8 rounded-[14px] border border-card-border bg-row-bg px-4 py-3">
        <div className="flex items-center gap-2.5 text-[13px]">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: STATUS_META.unknown.color }}
          />
          <span className="text-text-secondary">Not installed.</span>
        </div>
        {actionError ? (
          <p className="mt-1.5 text-[12px] leading-4" style={{ color: "#f85149" }}>
            {actionError}
          </p>
        ) : null}
      </div>
    );
  }

  const meta = STATUS_META[detail?.status ?? "unknown"] ?? STATUS_META.unknown;
  return (
    <div className="mb-8 rounded-[14px] border border-card-border bg-row-bg px-4 py-3">
      <div className="flex items-center gap-2.5 text-[13px]">
        <span className="size-2 shrink-0 rounded-full" style={{ background: meta.color }} />
        <span style={{ color: meta.color }} className="font-medium">
          {meta.label}
        </span>
        <span className="text-text-faint">·</span>
        <span className="text-text-secondary">Installed</span>
        {detail?.target ? (
          <>
            <span className="text-text-faint">·</span>
            <span className="min-w-0 truncate font-mono text-[12px] text-text-secondary">
              {detail.target}
            </span>
          </>
        ) : null}
      </div>
      {actionError ? (
        <p className="mt-1.5 text-[12px] leading-4" style={{ color: "#f85149" }}>
          {actionError}
        </p>
      ) : null}
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-text-primary">{value}</dd>
    </>
  );
}
