"use client";

/**
 * Reasoning-effort picker shown from the composer's "Select effort" pill. A
 * Base UI popover with a lightning header (current effort + model name) and a
 * segmented slider — matching the reference. The slider snaps to the discrete
 * effort levels; dragging or clicking a stop selects it.
 */
import { Popover } from "@base-ui-components/react/popover";
import {
  SparkleSingleIcon,
  RefreshIcon,
  ChevronRightIcon,
} from "../../chat/components/icons";

export const EFFORT_LEVELS = ["Minimal", "Low", "Medium", "High", "Max"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export function EffortMenu({
  trigger,
  value,
  modelLabel,
  onChange,
}: {
  trigger: React.ReactElement<Record<string, unknown>>;
  value: EffortLevel;
  modelLabel: string;
  onChange: (v: EffortLevel) => void;
}) {
  const idx = Math.max(0, EFFORT_LEVELS.indexOf(value));
  const pct = (idx / (EFFORT_LEVELS.length - 1)) * 100;

  return (
    <Popover.Root>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner side="top" align="end" sideOffset={8} className="z-50">
          <Popover.Popup
            className={[
              "w-[300px] rounded-[16.8px] border border-popover-border bg-popover-bg p-4",
              "backdrop-blur-xl shadow-[0px_10px_30px_-5px_rgba(0,0,0,0.5)]",
              "origin-[var(--transform-origin)] outline-none",
            ].join(" ")}
          >
            {/* Header: lightning + current effort + model, reset on the right */}
            <div className="flex items-center gap-2">
              <SparkleSingleIcon
                width={16}
                height={16}
                className="text-[color:var(--agent-accent)]"
              />
              <div className="flex flex-1 flex-col items-center">
                <span className="flex items-center gap-0.5 text-sm font-semibold leading-5 text-[color:var(--agent-accent)]">
                  {value}
                  <ChevronRightIcon
                    width={14}
                    height={14}
                    className="opacity-90"
                  />
                </span>
                <span className="text-xs leading-4 text-text-secondary">
                  {modelLabel}
                </span>
              </div>
              <button
                type="button"
                aria-label="Reset effort"
                onClick={() => onChange("Medium")}
                className="flex size-6 items-center justify-center rounded-full text-text-secondary transition-colors duration-150 ease-out hover:bg-nav-active-bg hover:text-text-strong"
              >
                <RefreshIcon width={14} height={14} />
              </button>
            </div>

            {/* Segmented slider */}
            <div className="relative mt-4 flex h-6 items-center">
              {/* track */}
              <div className="absolute inset-x-0 h-1.5 rounded-full bg-control-bg" />
              {/* filled portion */}
              <div
                className="absolute h-1.5 rounded-full bg-[color:var(--agent-accent)] transition-[width] duration-150"
                style={{
                  width: `${pct}%`,
                  transitionTimingFunction: "var(--ease-out-quart)",
                }}
              />
              {/* stops (clickable) */}
              <div className="absolute inset-x-0 flex items-center justify-between">
                {EFFORT_LEVELS.map((lvl, i) => {
                  const active = i === idx;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      aria-label={lvl}
                      onClick={() => onChange(lvl)}
                      className="flex size-6 items-center justify-center"
                    >
                      <span
                        className={[
                          "rounded-full transition-transform duration-150",
                          active
                            ? "size-4 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
                            : "size-2 bg-text-faint",
                        ].join(" ")}
                        style={{ transitionTimingFunction: "var(--ease-out-quart)" }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
