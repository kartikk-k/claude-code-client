"use client";

/**
 * Settings page layout building blocks — the section heading, the grouped card,
 * and the individual setting row (title + description on the left, control on
 * the right). These mirror the reference macOS settings window: a big page
 * title, muted section labels, and rounded cards whose rows are divided by a
 * hairline. Colors come entirely from the app's design tokens.
 */

/** The large page title at the top of each settings pane. */
export function SettingsTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.5px] text-text-strong">
        {children}
      </h1>
      {action ? <div className="shrink-0 pt-1.5">{action}</div> : null}
    </div>
  );
}

/** A muted group label above a card (e.g. "Permissions", "General"). */
export function SettingsSection({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-9">
      {title ? (
        <h2 className="mb-3 text-[15px] font-medium leading-5 text-text-primary">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

/** A rounded card that groups related rows, with hairline dividers between them. */
export function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-card-border bg-row-bg divide-y divide-row-divider">
      {children}
    </div>
  );
}

/**
 * A single setting row: a title, an optional description, and a trailing control
 * slot (switch / select / segmented / button / value). `control` sits on the
 * right, vertically centered against the label block.
 */
export function SettingsRow({
  title,
  description,
  control,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Trailing control (right-aligned). */
  control?: React.ReactNode;
  /** Optional full-width content rendered below the row (e.g. a text field). */
  children?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium leading-5 text-text-strong">
            {title}
          </div>
          {description ? (
            <p className="mt-1 text-[13px] leading-[18px] text-text-secondary">
              {description}
            </p>
          ) : null}
        </div>
        {control ? <div className="shrink-0">{control}</div> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/** A read-only value shown on the right of a row (e.g. a path, a version). */
export function RowValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="max-w-[240px] truncate text-[13px] leading-5 text-text-secondary">
      {children}
    </span>
  );
}

/** A small secondary button used in rows (e.g. "Change", "Reset"). */
export function RowButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[10px] border border-control-border bg-control-bg px-3 py-1.5 text-[13px] font-medium leading-5 text-text-primary transition-colors hover:bg-nav-active-bg/60"
    >
      {children}
    </button>
  );
}
