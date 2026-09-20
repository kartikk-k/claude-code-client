import { AppSidebar } from "../components/AppSidebar";

/**
 * Plugins shell: the app's left sidebar (projects / recents / nav) beside a
 * scrollable content column. The plugins marketplace + detail pages live here,
 * so the sidebar stays visible (the reference nests plugins inside the app
 * chrome rather than replacing it). Selecting a session from the sidebar routes
 * back to the app. Colors come from the app tokens.
 */
export default function PluginsLayout({
  children,
}: LayoutProps<"/plugins">) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-app-bg text-text-strong">
      <AppSidebar />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[860px] px-10 pb-16 pt-6">{children}</div>
      </main>
    </div>
  );
}
