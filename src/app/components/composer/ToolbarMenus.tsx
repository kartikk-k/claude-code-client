"use client";

/**
 * Composer toolbar dropdowns (permission mode + model), on the Base UI-backed
 * <Menu>. Both are true dropdowns, so Base UI gives them arrow-key navigation,
 * typeahead, Escape / outside-click close, and focus management for free.
 *
 * The slash / mention / add popups stay in Popovers.tsx: those are typeahead
 * panels anchored to the contentEditable, where focus must remain in the editor
 * — Base UI's focus-capturing Menu is the wrong tool for them.
 */
import { Menu, MenuItem, MenuHeading } from "../ui/Menu";
import { CheckIcon, ShieldIcon } from "../../chat/components/icons";
import { AlertIcon } from "./popoverIcons";
import type { PermissionValue } from "./Popovers";

const activeCheck = (
  <CheckIcon width={16} height={16} className="text-text-strong" />
);

/* ------------------------------- Permission ------------------------------- */

type PermissionOption = {
  value: PermissionValue;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent?: boolean;
};

const PERMISSION_OPTIONS: PermissionOption[] = [
  {
    value: "plan",
    title: "Ask for approval",
    description: "Always ask before edits and running commands",
    icon: <ShieldIcon width={16} height={16} />,
  },
  {
    value: "acceptEdits",
    title: "Approve for me",
    description: "Only ask for actions detected as potentially unsafe",
    icon: <ShieldIcon width={16} height={16} />,
  },
  {
    value: "bypassPermissions",
    title: "Full access",
    description: "Unrestricted access to files and commands",
    icon: <AlertIcon width={16} height={16} />,
    accent: true,
  },
];

export function PermissionMenu({
  trigger,
  value,
  onChange,
}: {
  trigger: React.ReactElement<Record<string, unknown>>;
  value: PermissionValue;
  onChange: (value: PermissionValue) => void;
}) {
  return (
    <Menu trigger={trigger} side="top" align="start" popupClassName="min-w-[320px]">
      <MenuHeading
        right={
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="text-xs leading-4 text-link hover:underline"
          >
            Learn more
          </a>
        }
      >
        How should Claude be approved?
      </MenuHeading>
      {PERMISSION_OPTIONS.map((opt) => (
        <MenuItem
          key={opt.value}
          icon={opt.icon}
          label={opt.title}
          description={opt.description}
          descriptionBelow
          accent={opt.accent}
          trailing={value === opt.value ? activeCheck : undefined}
          onSelect={() => onChange(opt.value)}
        />
      ))}
    </Menu>
  );
}

/* --------------------------------- Model ---------------------------------- */

export type ModelOption = { id: string; label: string; sub: string };

export function ModelMenu({
  trigger,
  value,
  options,
  onChange,
}: {
  trigger: React.ReactElement<Record<string, unknown>>;
  value: string;
  options: ModelOption[];
  onChange: (id: string) => void;
}) {
  return (
    <Menu trigger={trigger} side="top" align="end" popupClassName="min-w-[240px]">
      {options.map((m) => (
        <MenuItem
          key={m.id}
          label={m.label}
          description={m.sub}
          descriptionBelow
          trailing={m.id === value ? activeCheck : undefined}
          onSelect={() => onChange(m.id)}
        />
      ))}
    </Menu>
  );
}
