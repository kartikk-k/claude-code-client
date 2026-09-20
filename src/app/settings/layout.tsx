import { SettingsSidebar } from "./components/SettingsSidebar";

/**
 * Settings shell: a fixed left rail + a scrollable content column, filling the
 * app window (like the reference macOS settings window). Each pane is a nested
 * route under /settings and renders into `children`.
 */
export default function SettingsLayout({
  children,
}: LayoutProps<"/settings">) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-app-bg text-text-strong">
      <SettingsSidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-10 py-10">{children}</div>
      </main>
    </div>
  );
}
