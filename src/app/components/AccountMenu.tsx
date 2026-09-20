"use client";

/**
 * Options menu shown from the sidebar footer "Options" button. This app runs
 * locally with no signed-in account, so there is no user header — just the
 * actions: Usage / Invite a friend / Settings / Log out.
 *
 * Built on the Base UI-backed <Menu> so it gets arrow-key navigation,
 * typeahead, Escape / outside-click close, and focus management for free.
 */
import { useRouter } from "next/navigation";
import { Menu, MenuItem } from "./ui/Menu";
import {
  GaugeIcon,
  InviteIcon,
  GearIcon,
  LogoutIcon,
} from "../chat/components/icons";

export function AccountMenu({
  trigger,
  pctLeft,
  onSelect,
}: {
  /** The button that opens the menu (Base UI wires trigger behavior onto it). */
  trigger: React.ReactElement<Record<string, unknown>>;
  /** Usage remaining, 0–100, shown on the Usage row. */
  pctLeft: number;
  onSelect?: (id: "usage" | "invite" | "settings" | "logout") => void;
}) {
  const router = useRouter();
  // Default navigation for Usage/Settings; callers can still intercept via
  // onSelect (which takes precedence when provided).
  const handle = (id: "usage" | "invite" | "settings" | "logout") => {
    if (onSelect) return onSelect(id);
    if (id === "usage") router.push("/settings/general");
    if (id === "settings") router.push("/settings");
  };

  return (
    <Menu trigger={trigger} side="top" align="start" popupClassName="min-w-[240px]">
      <MenuItem
        icon={<GaugeIcon width={16} height={16} />}
        label="Usage"
        description={`${Math.round(pctLeft)}% left`}
        onSelect={() => handle("usage")}
      />
      <MenuItem
        icon={<InviteIcon width={16} height={16} />}
        label="Invite a friend"
        onSelect={() => handle("invite")}
      />
      <MenuItem
        icon={<GearIcon width={16} height={16} />}
        label="Settings"
        trailing={<span className="text-xs leading-4 text-text-faint">⌘,</span>}
        onSelect={() => handle("settings")}
      />
      <MenuItem
        icon={<LogoutIcon width={16} height={16} />}
        label="Log out"
        onSelect={() => handle("logout")}
      />
    </Menu>
  );
}
