"use client";

/**
 * The chat header's "More options" (⋯) menu. Mirrors the reference session
 * context menu — Rename / Pin / Archive / Share / Copy / New side chat / Fork /
 * Add scheduled task / Open in / Open in new window. Built on the design-system
 * Menu (Base UI) so it inherits keyboard nav, focus management and the blurred
 * popover surface. Actions are mocked (console.log) for now.
 *
 * The `trigger` is provided by the caller so it can carry the header's exact
 * button styling; Base UI merges its open/close behavior onto that node.
 */
import { Menu, MenuItem, MenuSeparator } from "./ui/Menu";
import {
  EditIcon,
  PinIcon,
  ShareIcon,
  CopyIcon,
  ChevronRightIcon,
  ClockIcon,
  ExpandIcon,
} from "../chat/components/icons";

function Shortcut({ keys }: { keys: string }) {
  return (
    <span className="whitespace-nowrap text-xs leading-4 text-text-faint">
      {keys}
    </span>
  );
}

const SubmenuArrow = () => <ChevronRightIcon className="size-4 icon-faint" />;

export function ChatOptionsMenu({
  trigger,
  title = "this chat",
}: {
  trigger: React.ReactElement<Record<string, unknown>>;
  /** Chat title, used only for the mock action logs. */
  title?: string;
}) {
  const act = (name: string) => () =>
    // TODO: wire to real chat actions
    console.log(`[chat menu] ${name}: ${title}`);

  return (
    <Menu trigger={trigger} side="bottom" align="end" popupClassName="min-w-[240px]">
      <MenuItem
        icon={<EditIcon width={16} height={16} />}
        label="Rename"
        trailing={<Shortcut keys="⌥⌘R" />}
        onSelect={act("Rename")}
      />
      <MenuItem
        icon={<PinIcon width={16} height={16} />}
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
