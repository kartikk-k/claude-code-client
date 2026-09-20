"use client";

/**
 * Design-system menu built on Base UI's <Menu>. Base UI provides the behavior
 * — arrow-key navigation, typeahead, Escape/outside-click to close, focus
 * management and ARIA — while these wrappers carry the app's look (the gray,
 * translucent, backdrop-blurred popover surface and the icon + label rows).
 *
 * Usage:
 *   <Menu trigger={<button>Options</button>} side="top" align="start">
 *     <MenuItem icon={<GaugeIcon />} label="Usage" description="45% left" />
 *     <MenuSeparator />
 *     <MenuItem icon={<LogoutIcon />} label="Log out" onSelect={...} />
 *   </Menu>
 */
import { Menu as BaseMenu } from "@base-ui-components/react/menu";

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

/** The raised popover surface — matches the shared Popover styling. */
export function Menu({
  trigger,
  children,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  popupClassName = "",
  open,
  onOpenChange,
}: {
  /**
   * The element that opens the menu. Base UI merges its trigger behavior
   * (aria, open/close, keyboard) onto this exact element via `render`, so it
   * stays the real DOM node — no extra wrapper — and keeps its own classes.
   */
  trigger: React.ReactElement<Record<string, unknown>>;
  children: React.ReactNode;
  side?: Side;
  align?: Align;
  sideOffset?: number;
  /** Extra classes on the popup surface (e.g. min-width). */
  popupClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <BaseMenu.Root open={open} onOpenChange={onOpenChange}>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          className="z-50 outline-none"
        >
          <BaseMenu.Popup
            className={[
              "min-w-[180px] rounded-[16.8px] border border-popover-border bg-popover-bg p-1.5",
              "backdrop-blur-md shadow-[0px_10px_30px_-5px_rgba(0,0,0,0.5)]",
              "origin-[var(--transform-origin)] outline-none",
              popupClassName,
            ].join(" ")}
          >
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

/** A single selectable row: icon + label, optional description (right-aligned
 *  or below the label) and trailing node. Highlight/focus styling comes from
 *  Base UI data attrs, so arrow-key navigation lights up the right row. */
export function MenuItem({
  icon,
  label,
  description,
  descriptionBelow = false,
  trailing,
  accent = false,
  disabled = false,
  closeOnClick = true,
  onSelect,
}: {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  /** Place the description under the label instead of to its right. */
  descriptionBelow?: boolean;
  trailing?: React.ReactNode;
  /** Destructive / warning emphasis. */
  accent?: boolean;
  disabled?: boolean;
  closeOnClick?: boolean;
  onSelect?: () => void;
}) {
  const labelColor = accent
    ? "text-[color:var(--agent-accent)]"
    : disabled
      ? "text-text-faint"
      : "text-text-strong";
  // Icons dim via opacity (icon-* classes), never an alpha text color, so
  // overlapping strokes don't double up.
  const iconColor = accent
    ? "text-[color:var(--agent-accent)]"
    : disabled
      ? "icon-faint"
      : "icon-muted";

  return (
    <BaseMenu.Item
      disabled={disabled}
      closeOnClick={closeOnClick}
      onClick={onSelect}
      className={[
        "flex w-full cursor-pointer select-none items-center gap-3 rounded-[11.2px] px-3 text-left outline-none transition-colors",
        // Fixed compact height for single-line rows; two-line rows (label +
        // description below) grow to fit so the description isn't clipped.
        descriptionBelow ? "py-1.5" : "h-8",
        "data-[highlighted]:bg-nav-active-bg",
        disabled ? "cursor-default opacity-60" : "",
      ].join(" ")}
    >
      {icon !== undefined ? (
        <span
          className={[
            "flex size-4 shrink-0 items-center justify-center",
            iconColor,
          ].join(" ")}
        >
          {icon}
        </span>
      ) : null}

      {descriptionBelow ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={[
              "truncate text-sm font-medium leading-5",
              labelColor,
            ].join(" ")}
          >
            {label}
          </span>
          {description ? (
            <span className="truncate text-xs leading-4 text-text-secondary">
              {description}
            </span>
          ) : null}
        </span>
      ) : (
        <>
          <span
            className={[
              "shrink-0 whitespace-nowrap text-sm font-medium leading-5",
              labelColor,
            ].join(" ")}
          >
            {label}
          </span>
          {description ? (
            <span className="ml-auto truncate pl-4 text-right text-xs leading-4 text-text-secondary">
              {description}
            </span>
          ) : null}
        </>
      )}

      {trailing !== undefined ? (
        <span
          className={[
            "shrink-0",
            descriptionBelow || !description ? "ml-auto" : "",
          ].join(" ")}
        >
          {trailing}
        </span>
      ) : null}
    </BaseMenu.Item>
  );
}

/** Non-interactive heading row inside a menu, with an optional right slot. */
export function MenuHeading({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-3 pb-1 pt-2">
      <span className="text-xs font-medium leading-4 text-text-secondary">
        {children}
      </span>
      {right}
    </div>
  );
}

/** Thin divider between groups of items. */
export function MenuSeparator() {
  return <BaseMenu.Separator className="my-1 h-px bg-popover-border" />;
}

/** Small section heading between groups. */
export function MenuGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <BaseMenu.GroupLabel className="px-3 pb-1 pt-2 text-xs font-medium leading-4 text-text-secondary">
      {children}
    </BaseMenu.GroupLabel>
  );
}
