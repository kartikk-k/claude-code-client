import { Suspense } from "react";
import { ClientShell } from "../ClientShell";

/**
 * Per-chat route: `/[chatId]` where chatId is a session id. Renders the SAME
 * ClientShell as `/` (so navigating between chats never remounts the shell —
 * persistent panels, terminals and streams survive). ClientShell reads the
 * chatId from the URL and resolves it to an active session on mount.
 *
 * Static routes (/settings, /plugins, /pull-requests) take priority over this
 * dynamic segment, so they are unaffected.
 */
export default async function ChatPage({
  params,
}: PageProps<"/[chatId]">) {
  const { chatId } = await params;
  return (
    <Suspense fallback={null}>
      <ClientShell chatId={chatId} />
    </Suspense>
  );
}
