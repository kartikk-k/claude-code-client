"use client";

/**
 * The "Changes" dropdown opened from the header's toggle-summary button.
 * Built on the app's design-system Menu wrappers (ui/Menu.tsx) — which sit on
 * Base UI's <Menu> — so it inherits keyboard nav, typeahead, focus management
 * and the translucent blurred popover surface for free.
 *
 * Content is mock/grouped to match the reference "Changes" popover: per-project
 * change rows, branch + commit actions, and a Sources group with thumbnails.
 * Diff counts use the GitHub-style green/red hexes inline (diff colors aren't in
 * the token set); everything else is theme tokens.
 */
import {
  Menu,
  MenuItem,
  MenuSeparator,
  MenuHeading,
} from "./ui/Menu";
import {
  GitBranchIcon,
  FolderIcon,
  PlusCircleIcon,
  ChevronRightIcon,
} from "../chat/components/icons";

/** Green/red diff counts — the only place raw hexes are allowed (see brief). */
function DiffCount({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="whitespace-nowrap text-xs font-medium leading-4 tabular-nums">
      <span className="text-[#3fb950]">+{added.toLocaleString()}</span>{" "}
      <span className="text-[#f85149]">-{removed.toLocaleString()}</span>
    </span>
  );
}

const Chevron = (
  <ChevronRightIcon className="size-4 icon-faint" aria-hidden />
);

/** Small square placeholder standing in for a source thumbnail. */
function ThumbPlaceholder() {
  return (
    <span className="size-4 shrink-0 rounded-[4px] border border-control-border bg-control-bg" />
  );
}

/** A "+" affordance shown on the right of a group heading. */
function AddButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-4 items-center justify-center rounded-[4px] text-text-secondary outline-none transition-colors hover:text-text-strong"
    >
      <PlusCircleIcon className="size-4" aria-hidden />
    </button>
  );
}

export function ChangesMenu({
  trigger,
}: {
  /** The element that opens the menu (Base UI render-prop trigger). */
  trigger: React.ReactElement<Record<string, unknown>>;
}) {
  return (
    <Menu trigger={trigger} side="bottom" align="end" popupClassName="min-w-[280px]">
      {/* Group: app */}
      <MenuHeading right={<AddButton label="Add to app" />}>app</MenuHeading>
      <MenuItem label="Changes" trailing={<DiffCount added={3387} removed={32} />} />
      <MenuItem label="Local" trailing={Chevron} />
      <MenuItem
        icon={<GitBranchIcon />}
        label="feat/integration-vanta"
        trailing={Chevron}
      />
      <MenuItem label="Commit or push" />
      <MenuItem label="Create pull request" accent />

      <MenuSeparator />

      {/* Group: Openhack design */}
      <MenuHeading>Openhack design</MenuHeading>
      <MenuItem label="Changes" />
      <MenuItem icon={<GitBranchIcon />} label="main" />
      <MenuItem label="Commit or push" />

      <MenuSeparator />

      {/* Group: Sources */}
      <MenuHeading right={<AddButton label="Add source" />}>Sources</MenuHeading>
      <MenuItem
        icon={<ThumbPlaceholder />}
        label="Screenshot 2026-09-20 at 14.32.png"
        descriptionBelow
      />
      <MenuItem
        icon={<ThumbPlaceholder />}
        label="Screenshot 2026-09-20 at 14.35.png"
        descriptionBelow
      />
      <MenuItem
        icon={<ThumbPlaceholder />}
        label="Screenshot 2026-09-20 at 14.41.png"
        descriptionBelow
      />
      <MenuItem icon={<FolderIcon />} label="View all" />
    </Menu>
  );
}
