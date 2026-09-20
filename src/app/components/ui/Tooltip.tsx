"use client";

/**
 * App tooltip, built on Base UI's <Tooltip>. Wraps any trigger element and
 * shows a small dark pill with a label and an optional keyboard shortcut —
 * matching the reference ("Toggle bottom panel  ⌘J"). Base UI handles the
 * hover/focus delay, positioning, and dismissal.
 *
 * Wrap the app once in <TooltipProvider> so tooltips share a delay and only
 * one shows at a time.
 */
import { Tooltip as BaseTooltip } from "@base-ui-components/react/tooltip";

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <BaseTooltip.Provider delay={400}>{children}</BaseTooltip.Provider>;
}

export function Tooltip({
  label,
  shortcut,
  side = "bottom",
  children,
}: {
  label: string;
  /** Optional keyboard-shortcut hint shown at the trailing edge. */
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactElement<Record<string, unknown>>;
}) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6} className="z-[60]">
          <BaseTooltip.Popup
            className={[
              "flex items-center gap-2 rounded-[10px] border border-popover-border bg-popover-bg px-2.5 py-1.5",
              "backdrop-blur-xl shadow-[0px_8px_24px_-6px_rgba(0,0,0,0.5)]",
              "origin-[var(--transform-origin)] text-text-strong",
              "transition-[opacity,transform] duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
            ].join(" ")}
            style={{ transitionTimingFunction: "var(--ease-out-quart)" }}
          >
            <span className="text-[13px] font-medium leading-4">{label}</span>
            {shortcut ? (
              <span className="rounded-md bg-control-bg px-1.5 py-0.5 text-[11px] leading-4 text-text-secondary">
                {shortcut}
              </span>
            ) : null}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
