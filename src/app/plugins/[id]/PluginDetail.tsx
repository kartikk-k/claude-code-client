"use client";

import { useState } from "react";
import Link from "next/link";
import type { Plugin } from "../catalog";
import { PluginTile } from "../components/PluginTile";
import {
  ChevronRightIcon,
  ArrowUpIcon,
  CopyIcon,
  CheckIcon,
  LinkIcon,
  WrenchIcon,
} from "../../chat/components/icons";

/**
 * Plugin detail page — hero (mark, name, tagline, actions), example prompts,
 * the tools this MCP server exposes, an install snippet, and an info table.
 * Matches the reference detail layout; colors are the app's tokens. Install /
 * copy are UI-only for now.
 */
export function PluginDetail({ plugin }: { plugin: Plugin }) {
  const [installed, setInstalled] = useState(plugin.installed);
  const [copied, setCopied] = useState(false);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(plugin.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
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
      <div className="mb-8">
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
                <LinkIcon className="size-4 icon-muted" />
              )}
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={() => setInstalled((v) => !v)}
              className={[
                "flex h-9 items-center gap-1.5 rounded-[11px] px-3.5 text-[13px] font-semibold transition-colors",
                installed
                  ? "border border-control-border bg-control-bg text-text-primary hover:bg-nav-active-bg/60"
                  : "bg-btn-solid-bg text-btn-solid-text hover:opacity-90",
              ].join(" ")}
            >
              {installed ? "Installed" : "Add plugin"}
            </button>
          </div>
        </div>
      </div>

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
              <button
                key={i}
                type="button"
                className="group flex items-center gap-3 rounded-[12px] border border-card-border bg-row-bg px-4 py-3 text-left transition-colors hover:bg-nav-active-bg/40"
              >
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="shrink-0 text-[13px] font-semibold text-text-primary">
                    {plugin.name}
                  </span>
                  <span className="text-[13px] leading-5 text-text-secondary">
                    {ex}
                  </span>
                </span>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-control-border text-text-secondary transition-colors group-hover:bg-nav-active-bg group-hover:text-text-strong">
                  <ArrowUpIcon className="size-3.5 rotate-90" />
                </span>
              </button>
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
          <InfoRow label="Transport" value={plugin.transport.toUpperCase()} />
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
