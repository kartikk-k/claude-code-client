"use client";

/**
 * Right-click / "…" context menu for a session row in the left sidebar.
 *
 * Built on the Base UI-backed <Menu> wrappers (so it inherits arrow-key
 * navigation, typeahead, Escape / outside-click close and focus management).
 * The trigger is the small "…" affordance that appears on row hover; the parent
 * row forwards its native `onContextMenu` here by clicking that same trigger, so
 * both right-click and the button open one menu, anchored to the button.
 *
 * All actions are mocked for now (console.log) — this is a "make it exist" pass.
 */
import { forwardRef } from "react";
import { Menu, MenuItem, MenuSeparator } from "./ui/Menu";
import {
  DotsIcon,
  ShareIcon,
  CopyIcon,
  ChevronRightIcon,
  ClockIcon,
  ExpandIcon,
} from "../chat/components/icons";

/** Muted keyboard-shortcut hint, right-aligned in a menu row's trailing slot. */
function Shortcut({ keys }: { keys: string }) {
  return (
    <span className="whitespace-nowrap text-xs leading-4 text-text-faint">
      {keys}
    </span>
  );
}

/** Submenu affordance glyph (a plain chevron — real submenus are TODO). */
function SubmenuArrow() {
  return <ChevronRightIcon className="size-4 icon-faint" />;
}

/**
 * The "…" trigger button. Exposed as a ref so the row can programmatically open
 * the menu from a right-click without the user hitting the button directly.
 * Hidden until the row is hovered (or the menu is open), and always reachable
 * via keyboard focus for accessibility.
 */
const MoreButton = forwardRef<HTMLButtonElement, Record<string, unknown>>(
  function MoreButton(props, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label="Session options"
        {...props}
        className={[
          "flex size-6 shrink-0 items-center justify-center rounded-md text-text-secondary outline-none transition-colors duration-150 ease-out",
          "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          "hover:bg-nav-active-bg hover:text-text-strong",
          "data-[popup-open]:opacity-100 data-[popup-open]:bg-nav-active-bg",
        ].join(" ")}
      >
        <DotsIcon className="size-4" />
      </button>
    );
  },
);

export function SessionRowMenu({
  title,
  triggerRef,
  open,
  onOpenChange,
}: {
  /** Session title, used only to make the console mock logs legible. */
  title: string;
  /** Ref to the "…" trigger, so the row can open the menu on right-click. */
  triggerRef?: React.Ref<HTMLButtonElement>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const act = (name: string) => () =>
    // TODO: wire to real session actions
    console.log(`[session menu] ${name}: ${title}`);

  return (
    <Menu
      trigger={<MoreButton ref={triggerRef} />}
      side="bottom"
      align="start"
      open={open}
      onOpenChange={onOpenChange}
      popupClassName="min-w-[220px]"
    >
      <MenuItem
        label="Rename"
        trailing={<Shortcut keys="⌥⌘R" />}
        onSelect={act("Rename")}
      />
      <MenuItem
        label="Pin"
        trailing={<Shortcut keys="⌥⌘P" />}
        onSelect={act("Pin")}
      />
      <MenuItem
        label="Archive"
        trailing={<Shortcut keys="⇧⌘A" />}
        onSelect={act("Archive")}
      />

      <MenuSeparator />

      <MenuItem
        icon={<ShareIcon width={16} height={16} />}
        label="Share"
        onSelect={act("Share")}
      />
      <MenuItem
        icon={<CopyIcon width={16} height={16} />}
        label="Copy"
        trailing={<SubmenuArrow />}
        closeOnClick={false}
        onSelect={act("Copy")}
      />

      <MenuSeparator />

      <MenuItem
        label="New side chat"
        trailing={<Shortcut keys="⌥⌘S" />}
        onSelect={act("New side chat")}
      />
      <MenuItem
        label="Fork"
        trailing={<SubmenuArrow />}
        closeOnClick={false}
        onSelect={act("Fork")}
      />
      <MenuItem
        icon={<ClockIcon width={16} height={16} />}
        label="Add scheduled task…"
        onSelect={act("Add scheduled task")}
      />

      <MenuSeparator />

      <MenuItem
        label="Open in"
        trailing={<SubmenuArrow />}
        closeOnClick={false}
        onSelect={act("Open in")}
      />
      <MenuItem
        icon={<ExpandIcon width={16} height={16} />}
        label="Open in new window"
        onSelect={act("Open in new window")}
      />
    </Menu>
  );
}
