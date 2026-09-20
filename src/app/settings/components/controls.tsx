"use client";

/**
 * Settings form controls — the small interactive primitives (Switch, Segmented,
 * Select) that settings rows compose. These are presentation-only: they take a
 * value + onChange and carry the app's design-system look (tokens from
 * globals.css). No persistence is wired yet — the settings pages hold local
 * state so the UI is fully interactive for review.
 */
import { useId } from "react";
import { Menu, MenuItem } from "../../components/ui/Menu";
import { ChevronDownIcon, CheckIcon } from "../../chat/components/icons";

/** iOS-style toggle. On = the green `--switch-on` track from the design tokens. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name (visually hidden — the row label describes it). */
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full outline-none",
        "transition-colors duration-200 ease-out",
        checked ? "bg-switch-on" : "bg-control-border",
      ].join(" ")}
      style={{ transitionTimingFunction: "var(--ease-out-quart)" }}
    >
      <span
        className="inline-block size-[18px] rounded-full bg-switch-knob shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-200"
        style={{
          transitionTimingFunction: "var(--ease-out-quart)",
          transform: checked ? "translateX(18px)" : "translateX(2px)",
        }}
      />
    </button>
  );
}

/** A compact 2+ option pill group (e.g. Bottom / Right). */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-[10px] bg-control-bg p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={[
              "rounded-[8px] px-3 py-1 text-[13px] font-medium leading-5 transition-colors duration-150 ease-out",
              active
                ? "bg-card-float-bg text-text-strong shadow-[0_1px_2px_rgba(0,0,0,0.15)]"
                : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** A dropdown select built on the design-system Menu, styled as a small control. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  leadingIcon,
  minWidth = 140,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (next: T) => void;
  leadingIcon?: React.ReactNode;
  minWidth?: number;
}) {
  const current = options.find((o) => o.value === value);
  const id = useId();
  return (
    <Menu
      side="bottom"
      align="end"
      popupClassName="min-w-[180px]"
      trigger={
        <button
          type="button"
          id={id}
          className="flex items-center gap-1.5 rounded-[10px] border border-control-border bg-control-bg px-2.5 py-1.5 text-[13px] font-medium leading-5 text-text-primary outline-none transition-colors hover:bg-nav-active-bg/60 data-[popup-open]:bg-nav-active-bg"
        >
          {current?.icon ?? leadingIcon}
          <span className="truncate">{current?.label ?? value}</span>
          <ChevronDownIcon className="size-3.5 icon-muted" />
        </button>
      }
    >
      {options.map((opt) => (
        <MenuItem
          key={opt.value}
          icon={opt.icon}
          label={opt.label}
          trailing={
            opt.value === value ? (
              <CheckIcon className="size-4 icon-strong" />
            ) : undefined
          }
          onSelect={() => onChange(opt.value)}
        />
      ))}
    </Menu>
  );
}
