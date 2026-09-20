"use client";

/**
 * Rich hover-preview card for sidebar rows (projects + chats). Built on Base
 * UI's Tooltip so it shares the app's hover-delay + dismissal behavior. Matches
 * the reference: a title row (icon + title + optional trailing time), a divider,
 * a list of metadata rows (icon + text), and an optional footer action row.
 *
 * It wraps the row as its trigger; the row keeps its own click behavior.
 */
import { Tooltip as BaseTooltip } from "@base-ui-components/react/tooltip";

export type HoverMetaRow = {
  icon: React.ReactNode;
  text: string;
  /** Muted (secondary) vs strong text. */
  muted?: boolean;
};

export function SidebarHoverCard({
  children,
  title,
  titleIcon,
  trailing,
  rows,
  footer,
  divider = true,
  side = "right",
}: {
  /** The row element this card previews (its trigger). */
  children: React.ReactElement<Record<string, unknown>>;
  title: string;
  /** Small icon shown after the title (e.g. a laptop for a local chat). */
  titleIcon?: React.ReactNode;
  /** Right-aligned trailing text in the title row (e.g. "1d"). */
  trailing?: string;
  rows: HoverMetaRow[];
  /** Optional footer action row (e.g. "Edit project"). */
  footer?: { icon: React.ReactNode; label: string; onClick?: () => void };
  /** Whether to draw a divider between the title and the metadata rows.
   *  Projects use one; chats don't (per the reference). */
  divider?: boolean;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} align="start" sideOffset={8} className="z-[60]">
          <BaseTooltip.Popup
            className={[
              "w-[340px] max-w-[80vw] rounded-[16px] border border-popover-border bg-popover-bg py-1.5",
              "backdrop-blur-xl shadow-[0px_10px_30px_-5px_rgba(0,0,0,0.5)]",
              "origin-[var(--transform-origin)] text-text-strong",
              "transition-[opacity,transform] duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
            ].join(" ")}
            style={{ transitionTimingFunction: "var(--ease-out-quart)" }}
          >
            {/* Title row */}
            <div className="flex items-center gap-2 px-3.5 py-2">
              <span className="truncate text-[15px] font-semibold leading-6 text-text-strong">
                {title}
              </span>
              {titleIcon ? (
                <span className="shrink-0 icon-muted">{titleIcon}</span>
              ) : null}
              {trailing ? (
                <span className="ml-auto shrink-0 text-[13px] leading-5 text-text-faint tabular-nums">
                  {trailing}
                </span>
              ) : null}
            </div>

            {divider ? (
              <div className="mx-3.5 h-px bg-popover-border" />
            ) : null}

            {/* Metadata rows */}
            <div className="flex flex-col py-0.5">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-3 px-3.5 py-1.5">
                  <span className="flex size-4 shrink-0 items-center justify-center icon-muted">
                    {row.icon}
                  </span>
                  <span
                    className={[
                      "truncate text-sm leading-5",
                      row.muted ? "text-text-secondary" : "text-text-strong",
                    ].join(" ")}
                  >
                    {row.text}
                  </span>
                </div>
              ))}
            </div>

            {footer ? (
              <>
                <div className="mx-3.5 h-px bg-popover-border" />
                <button
                  type="button"
                  onClick={footer.onClick}
                  className="mt-0.5 flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors duration-150 ease-out hover:bg-nav-active-bg"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center icon-muted">
                    {footer.icon}
                  </span>
                  <span className="text-sm leading-5 text-text-strong">
                    {footer.label}
                  </span>
                </button>
              </>
            ) : null}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
