"use client";

/**
 * The chat header's "More options" (⋯) menu. A trimmed, honest mirror of the
 * sidebar's SessionRowMenu: Rename / Pin / Archive / Copy title / Delete — the
 * actions that are actually wired to the session store. Built on the
 * design-system Menu (Base UI) so it inherits keyboard nav, focus management
 * and the blurred popover surface.
 *
 * The `trigger` is provided by the caller so it can carry the header's exact
 * button styling; Base UI merges its open/close behavior onto that node.
 *
 * The header has no inline rename editor, so Rename falls back to window.prompt.
 */
import { Menu, MenuItem, MenuSeparator } from "./ui/Menu";
import { EditIcon, PinIcon, CopyIcon, TrashIcon } from "../chat/components/icons";
import { useSessionStore } from "@/stores";

function Shortcut({ keys }: { keys: string }) {
  return (
    <span className="whitespace-nowrap text-xs leading-4 text-text-faint">
      {keys}
    </span>
  );
}

export function ChatOptionsMenu({
  trigger,
  title = "this chat",
  projectId,
  sessionId,
  pinned = false,
  archived = false,
}: {
  trigger: React.ReactElement<Record<string, unknown>>;
  /** Chat title, used for the rename prompt default + copy-title. */
  title?: string;
  projectId?: string;
  sessionId?: string;
  pinned?: boolean;
  archived?: boolean;
}) {
  const renameSession = useSessionStore((s) => s.renameSession);
  const setPinned = useSessionStore((s) => s.setPinned);
  const setArchived = useSessionStore((s) => s.setArchived);
  const deleteSession = useSessionStore((s) => s.deleteSession);

  // No active chat → the menu's actions have nothing to target.
  const hasTarget = Boolean(projectId && sessionId);

  const doRename = () => {
    if (!hasTarget || typeof window === "undefined") return;
    const next = window.prompt("Rename chat", title);
    const trimmed = next?.trim();
    if (trimmed && trimmed !== title) {
      renameSession(projectId!, sessionId!, trimmed);
    }
  };

  const doCopyTitle = () => {
    navigator.clipboard.writeText(title);
  };

  const doDelete = () => {
    if (!hasTarget) return;
    if (
      typeof window !== "undefined" &&
      window.confirm(
        "Delete this chat? Its transcript is moved to the trash folder.",
      )
    ) {
      deleteSession(projectId!, sessionId!);
    }
  };

  return (
    <Menu trigger={trigger} side="bottom" align="end" popupClassName="min-w-[240px]">
      <MenuItem
        icon={<EditIcon width={16} height={16} />}
        label="Rename"
        trailing={<Shortcut keys="⌥⌘R" />}
        onSelect={doRename}
      />
      <MenuItem
        icon={<PinIcon width={16} height={16} />}
        label={pinned ? "Unpin" : "Pin"}
        trailing={<Shortcut keys="⌥⌘P" />}
        onSelect={() => hasTarget && setPinned(projectId!, sessionId!, !pinned)}
      />
      <MenuItem
        label={archived ? "Unarchive" : "Archive"}
        trailing={<Shortcut keys="⇧⌘A" />}
        onSelect={() =>
          hasTarget && setArchived(projectId!, sessionId!, !archived)
        }
      />

      <MenuSeparator />

      <MenuItem
        icon={<CopyIcon width={16} height={16} />}
        label="Copy title"
        onSelect={doCopyTitle}
      />

      <MenuSeparator />

      <MenuItem
        icon={<TrashIcon width={16} height={16} />}
        label="Delete"
        accent
        onSelect={doDelete}
      />
    </Menu>
  );
}
