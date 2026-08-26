import { NewChatIcon, EditIcon, PinIcon } from "./icons";

function IconButton({
  children,
  className = "",
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={[
        "flex size-8 shrink-0 items-center justify-center rounded-[11.2px] border-[0.556px] border-transparent text-text-secondary transition-colors hover:bg-bubble-bg hover:text-text-strong",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function ChatNav({ title }: { title: string }) {
  return (
    <header className="flex h-11 shrink-0 items-center px-1.5">
      <div className="flex items-center">
        <IconButton label="New chat">
          <NewChatIcon />
        </IconButton>
        <div className="flex items-center rounded-[11.2px] px-1.5 py-1">
          <p className="max-w-[350px] truncate text-[13px] font-medium leading-[18.571px] tracking-[-0.091px] text-text-primary">
            {title}
          </p>
        </div>
        <IconButton label="Rename chat">
          <EditIcon />
        </IconButton>
      </div>

      <div className="flex-1" />

      <IconButton label="Toggle pinned summary" className="opacity-50">
        <PinIcon />
      </IconButton>
    </header>
  );
}
