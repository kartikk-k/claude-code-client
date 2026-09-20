import React from "react";
import {
  FolderIcon,
  ShareIcon,
  DotsIcon,
  ListReorderIcon,
  PanelRightClosedIcon,
} from "./icons";
import { ChangesMenu } from "../../components/ChangesMenu";
import { ChatOptionsMenu } from "../../components/ChatOptionsMenu";
import { Tooltip } from "../../components/ui/Tooltip";

function IconButton({
  children,
  className = "",
  label,
  ref,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement> & {
    ref?: React.Ref<HTMLButtonElement>;
  }) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={[
        "flex size-8 shrink-0 items-center justify-center rounded-[11.2px] border-[0.556px] border-transparent icon-muted transition-[opacity,background-color] duration-150 ease-out hover:bg-bubble-bg hover:opacity-100",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ChatNav({
  title,
  rightPanelOpen = true,
  onToggleRightPanel,
}: {
  title: string;
  rightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center px-1.5">
      <div className="flex min-w-0 items-center gap-1">
        <span className="flex size-6 shrink-0 items-center justify-center text-text-secondary">
          <FolderIcon width={16} height={16} />
        </span>
        <p className="max-w-[420px] truncate text-[13px] font-medium leading-[18.571px] tracking-[-0.091px] text-text-primary">
          {title}
        </p>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-0.5">
        {/* More options — opens the chat context menu (Rename / Pin / … ). */}
        <ChatOptionsMenu
          title={title}
          trigger={
            <IconButton label="More options">
              <DotsIcon width={18} height={18} />
            </IconButton>
          }
        />
        <Tooltip label="Share chat" side="bottom">
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-[11.2px] px-2.5 icon-muted transition-[opacity,background-color] duration-150 ease-out hover:bg-bubble-bg hover:opacity-100"
          >
            <ShareIcon width={17} height={17} />
            <span className="text-[13px] font-medium leading-5">Share</span>
          </button>
        </Tooltip>
        {/* Toggle-summary: opens the Changes / branches / sources menu. */}
        <ChangesMenu
          trigger={
            <IconButton label="Toggle summary">
              <ListReorderIcon width={17} height={17} />
            </IconButton>
          }
        />
        {/* Show-panel control. Only rendered when the panel is HIDDEN — while
            the panel is open it owns its own collapse control in its header, so
            we don't duplicate it here. */}
        {!rightPanelOpen ? (
          <Tooltip label="Show panel" side="bottom">
            <IconButton label="Show panel" onClick={onToggleRightPanel}>
              <PanelRightClosedIcon width={18} height={18} />
            </IconButton>
          </Tooltip>
        ) : null}
      </div>
    </header>
  );
}
