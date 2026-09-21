"use client";

/**
 * Store barrel — re-exports the three module-singleton Zustand stores plus small
 * selector hooks that keep component subscriptions narrow (so a panel that only
 * cares about its width doesn't re-render when an unrelated toggle flips).
 *
 * The stores are plain module singletons (no React provider), which is exactly
 * why their state survives route changes: they live outside the component tree.
 */
export { usePrefsStore, DEFAULT_SHORTCUTS } from "./prefs.store";
export type {
  ModelId,
  Shortcut,
  GeneralSettings,
  AppearanceSettings,
  ModelSettings,
  PermissionsSettings,
  AboutSettings,
} from "./prefs.store";

export { useSessionStore } from "./session.store";
export type { StreamState } from "./session.store";

export {
  useUiStore,
  DEFAULT_CHAT_LAYOUT,
  NO_CHAT_KEY,
  RIGHT_MIN_WIDTH,
  RIGHT_MAX_WIDTH,
  RIGHT_DEFAULT_WIDTH,
  BOTTOM_MIN_HEIGHT,
  BOTTOM_MAX_HEIGHT,
  BOTTOM_DEFAULT_HEIGHT,
  LEFT_MIN_WIDTH,
  LEFT_MAX_WIDTH,
  LEFT_DEFAULT_WIDTH,
} from "./ui.store";
export type {
  RightTab,
  ChatLayout,
  DraftAttachment,
  OpenTab,
  BottomTerm,
} from "./ui.store";

import { useUiStore } from "./ui.store";
import { useSessionStore } from "./session.store";

/** The active {projectId, sessionId} pointer (or null). */
export const useActiveSession = () => useSessionStore((s) => s.active);

/** The loaded transcript for the active session, if any. */
export const useActiveTranscript = () =>
  useSessionStore((s) =>
    s.active?.sessionId ? s.transcripts[s.active.sessionId] : undefined,
  );

/** The live stream state for a session, if a turn is generating. */
export const useStreaming = (sessionId: string | null | undefined) =>
  useSessionStore((s) => (sessionId ? s.streaming[sessionId] : undefined));

/** The per-chat layout for a session (defaults when unsaved). */
export const useChatLayout = (sessionId: string | null | undefined) =>
  useUiStore((s) => s.getLayout(sessionId));
