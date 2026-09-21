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
import { DotsIcon, CopyIcon, TrashIcon } from "../chat/components/icons";
import { useSessionStore } from "@/stores";

/** Muted keyboard-shortcut hint, right-aligned in a menu row's trailing slot. */
function Shortcut({ keys }: { keys: string }) {
  return (
    <span className="whitespace-nowrap text-xs leading-4 text-text-faint">
      {keys}
    </span>
  );
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
  projectId,
  sessionId,
  pinned = false,
  archived = false,
  triggerRef,
  open,
  onOpenChange,
  onRename,
  onCopyTitle,
}: {
  projectId: string;
  sessionId: string;
  pinned?: boolean;
  archived?: boolean;
  /** Ref to the "…" trigger, so the row can open the menu on right-click. */
  triggerRef?: React.Ref<HTMLButtonElement>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Start the row's inline rename editor (the row owns the input). */
  onRename?: () => void;
  /** Copy the session title to the clipboard. */
  onCopyTitle?: () => void;
}) {
  const setPinned = useSessionStore((s) => s.setPinned);
  const setArchived = useSessionStore((s) => s.setArchived);
  const deleteSession = useSessionStore((s) => s.deleteSession);

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
        onSelect={() => onRename?.()}
      />
      <MenuItem
        label={pinned ? "Unpin" : "Pin"}
        trailing={<Shortcut keys="⌥⌘P" />}
        onSelect={() => setPinned(projectId, sessionId, !pinned)}
      />
      <MenuItem
        label={archived ? "Unarchive" : "Archive"}
        trailing={<Shortcut keys="⇧⌘A" />}
        onSelect={() => setArchived(projectId, sessionId, !archived)}
      />

      <MenuSeparator />

      <MenuItem
        icon={<CopyIcon width={16} height={16} />}
        label="Copy title"
        onSelect={() => onCopyTitle?.()}
      />

      <MenuSeparator />

      <MenuItem
        icon={<TrashIcon width={16} height={16} />}
        label="Delete"
        accent
        onSelect={() => {
          if (
            typeof window !== "undefined" &&
            window.confirm(
              "Delete this chat? Its transcript is moved to the trash folder.",
            )
          ) {
            deleteSession(projectId, sessionId);
          }
        }}
      />
    </Menu>
  );
}
