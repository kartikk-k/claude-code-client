import { AppSidebar } from "../components/AppSidebar";

/**
 * Pull-requests shell: the app's left sidebar (projects / recents / nav) beside
 * the pull-requests triage view. Like /plugins, this nests inside the app
 * chrome rather than replacing it, so the sidebar stays visible and selecting a
 * session routes back to the chat app.
 *
 * Unlike /plugins (a single centered content column), the PR view is a two-pane
 * split — a scrollable list column beside a fixed detail panel — so the <main>
 * here fills the full remaining width and the page itself owns the split.
 */
export default function PullRequestsLayout({
  children,
}: LayoutProps<"/pull-requests">) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-app-bg text-text-strong">
      <AppSidebar />
      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
