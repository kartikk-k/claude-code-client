"use client";

/**
 * RichComposer — the primary chat input.
 *
 * Visually matches the aside-ui Composer (rounded-[20px], bg-composer-bg, the
 * layered ring+shadow) and adds the interactive machinery a Claude Code client
 * needs:
 *
 *  • Image drop + paste  — dropped/pasted images are read to data URLs and
 *    shown as a removable thumbnail row above the input.
 *  • Rich contenteditable — @file mentions and <context> annotations render as
 *    inline, non-editable PILL chips (contentEditable=false spans).
 *  • Triggers — "/" at line start opens the SlashMenu; "@" opens the
 *    MentionMenu (query = text after @); the left "+" opens the AddMenu; the
 *    permission pill opens the PermissionMenu.
 *  • Toolbar — permission pill, model selector, effort pill, mic + send.
 *
 * SERIALIZATION (see `serialize()` below): the contenteditable is walked
 * node-by-node. Plain text nodes contribute their text; a mention pill emits
 * `@file(<path>)` and a context pill emits `<context>…</context>`; <br>/<div>
 * boundaries become newlines. The resulting string is what `onSend` receives as
 * `text`, so the transcript stays plain-text while the UI stays rich.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpIcon,
  PlusCircleIcon,
  ShieldIcon,
  SparkleIcon,
  SparkleSingleIcon,
  ChevronDownIcon,
  XIcon,
  FolderIcon,
  FileIcon,
  GitBranchIcon,
} from "../chat/components/icons";
import {
  SlashMenu,
  MentionMenu,
  AddMenu,
  slashItems,
  mentionMatches,
  addItems,
  type PermissionValue,
  type SlashItem,
  type MentionFile,
  type AddItem,
} from "./composer/Popovers";
import { PermissionMenu, ModelMenu } from "./composer/ToolbarMenus";
import { EffortMenu, type EffortLevel } from "./composer/EffortMenu";
import { usePrefsStore, useUiStore, type ModelId } from "@/stores";

/* -------------------------------------------------------------------------- */
/* Types + static config                                                      */
/* -------------------------------------------------------------------------- */

export type RichComposerProps = {
  onSend: (payload: {
    text: string;
    images: string[];
    model: string;
    permissionMode: string;
  }) => void;
  /** Hard-disable: no session/cwd to run in. Blocks typing entirely. */
  disabled?: boolean;
  /**
   * A turn is currently generating. Typing is still allowed — sending now
   * QUEUES the message (auto-sent after the turn). The send button becomes a
   * "queue" affordance and the placeholder hints at it.
   */
  isGenerating?: boolean;
  cwd?: string;
  /** Active session id — keys the per-chat draft persisted in the UI store. */
  sessionId?: string;
  /** Active session's git branch, if any — drives the branch chip. */
  gitBranch?: string;
  /** Open a file attachment in the right sidebar's Preview tab. */
  onOpenInPanel?: (file: { name: string; url: string; mime: string }) => void;
};

/** Last path segment of a cwd, for the context-bar folder chip. */
function cwdBasename(cwd: string): string {
  const parts = cwd.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || cwd;
}

/** An attachment kind, deciding how it renders + what "opening" it does. */
type AttachKind = "image" | "text" | "other";
type Thumb = {
  id: string;
  url: string;
  name: string;
  kind: AttachKind;
  /** MIME type (best-effort). */
  mime: string;
};

/** Classify a file into an attachment kind. */
function classifyFile(name: string, mime: string): AttachKind {
  if (mime.startsWith("image/")) return "image";
  if (
    mime.startsWith("text/") ||
    /\.(txt|md|markdown|json|ya?ml|csv|log|tsx?|jsx?|css|html?|xml|sh)$/i.test(
      name
    )
  ) {
    return "text";
  }
  return "other"; // pdf, docx, binaries, folders, …
}
// permission + model are owned by Base UI menus; only these live in local state.
type OpenMenu = "none" | "slash" | "mention" | "add";


type ModelOption = { id: string; label: string; sub: string };
const MODEL_OPTIONS: ModelOption[] = [
  { id: "opus", label: "Claude Opus 4.8", sub: "Most capable" },
  { id: "sonnet", label: "Claude Sonnet 5", sub: "Balanced" },
  { id: "haiku", label: "Claude Haiku 4.5", sub: "Fastest" },
];

/** Pill label + emphasis for each permission mode. */
const PERMISSION_PILL: Record<
  PermissionValue,
  { label: string; accent: boolean }
> = {
  plan: { label: "Ask for approval", accent: false },
  acceptEdits: { label: "Approve for me", accent: false },
  bypassPermissions: { label: "Full access", accent: true },
};

/* -------------------------------------------------------------------------- */
/* Serialization helpers                                                       */
/* -------------------------------------------------------------------------- */

/** Walk the editor DOM and produce the plain-text prompt. */
function serialize(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === "BR") {
      out += "\n";
      return;
    }
    const kind = el.dataset.pill;
    if (kind === "mention") {
      out += `@file(${el.dataset.value ?? ""})`;
      return;
    }
    if (kind === "context") {
      out += `<context>${el.dataset.value ?? ""}</context>`;
      return;
    }
    // Block elements (div/p) the browser inserts on Enter → leading newline.
    const isBlock = el.tagName === "DIV" || el.tagName === "P";
    if (isBlock && out.length > 0 && !out.endsWith("\n")) out += "\n";
    el.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return out.replace(/ /g, " ").trim();
}

/** Build an inline, non-editable pill chip element. */
function makePill(
  kind: "mention" | "context",
  value: string,
  label: string
): HTMLSpanElement {
  const span = document.createElement("span");
  span.dataset.pill = kind;
  span.dataset.value = value;
  span.contentEditable = "false";
  span.className =
    "mx-0.5 inline-flex select-none items-center gap-1 rounded-full bg-bubble-bg px-2 py-0.5 align-middle text-xs font-medium text-text-strong";
  const text = document.createElement("span");
  text.textContent = label;
  span.appendChild(text);
  // Non-editable close affix; clicks handled by the editor's delegated handler.
  const x = document.createElement("span");
  x.dataset.pillRemove = "1";
  x.setAttribute("role", "button");
  x.setAttribute("aria-label", "Remove");
  x.className =
    "-mr-0.5 flex size-3.5 cursor-pointer items-center justify-center rounded-full text-text-secondary hover:text-text-strong";
  x.textContent = "×";
  span.appendChild(x);
  return span;
}

/* -------------------------------------------------------------------------- */
/* Toolbar pill                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Toolbar pill. Forwards its ref and any extra props to the inner <button> so
 * it can act as a Base UI `Menu.Trigger` (which injects onClick / aria / ref).
 */
const PillButton = React.forwardRef<
  HTMLButtonElement,
  {
    icon?: React.ReactNode;
    label?: string;
    chevron?: boolean;
    accent?: boolean;
    ariaLabel?: string;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function PillButton(
  { icon, label, chevron = true, accent = false, ariaLabel, className, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="menu"
      className={[
        "flex h-7 items-center justify-center gap-1 rounded-full border-[0.556px] border-transparent px-2.5 transition-colors hover:bg-bubble-bg",
        accent ? "text-[color:var(--agent-accent)]" : "text-text-secondary",
        className ?? "",
      ].join(" ")}
      {...rest}
    >
      {icon}
      {label ? (
        <span className="text-xs font-medium leading-4">{label}</span>
      ) : null}
      {chevron ? (
        <ChevronDownIcon width={14} height={14} className="opacity-80" />
      ) : null}
    </button>
  );
});

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export function RichComposer({
  onSend,
  disabled = false,
  isGenerating = false,
  cwd,
  sessionId,
  gitBranch,
  onOpenInPanel,
}: RichComposerProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Debounce timer for persisting the draft as the user types.
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `images` holds ALL attachments (images + files); the name is kept for churn.
  const [images, setImages] = useState<Thumb[]>([]);
  const [hasText, setHasText] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // The image currently shown in the lightbox preview (null = closed).
  const [previewImage, setPreviewImage] = useState<Thumb | null>(null);

  // Model / effort / permission are the global composer defaults, so they
  // persist across chats and reloads (read + written via the prefs store).
  const model = usePrefsStore((s) => s.model);
  const setModel = usePrefsStore((s) => s.setModel);
  const effort = usePrefsStore((s) => s.effort);
  const setEffort = usePrefsStore((s) => s.setEffort);
  const permission = usePrefsStore((s) => s.permission);
  const setPermission = usePrefsStore((s) => s.setPermission);

  // Per-chat draft persistence, keyed by sessionId in the UI store.
  const patchLayout = useUiStore((s) => s.patchLayout);
  const getLayout = useUiStore((s) => s.getLayout);

  const [menu, setMenu] = useState<OpenMenu>("none");
  const [mentionQuery, setMentionQuery] = useState("");
  // Keyboard-highlighted row within the open typeahead menu (slash/mention/add).
  const [activeIndex, setActiveIndex] = useState(0);

  // The flat, ordered selectable items for whichever typeahead menu is open.
  const typeaheadItems: (SlashItem | MentionFile | AddItem)[] =
    menu === "slash"
      ? slashItems()
      : menu === "mention"
        ? mentionMatches(mentionQuery)
        : menu === "add"
          ? addItems()
          : [];

  const permPill = PERMISSION_PILL[permission];
  const modelLabel =
    MODEL_OPTIONS.find((m) => m.id === model)?.label ?? "Claude Sonnet 5";
  const canSend = !disabled && (hasText || images.length > 0);

  const closeMenu = useCallback(() => {
    setMenu("none");
    setMentionQuery("");
    setActiveIndex(0);
  }, []);

  // Snap the highlight back to the first row whenever the open menu changes or
  // the mention query reflows the filtered list.
  useEffect(() => {
    setActiveIndex(0);
  }, [menu, mentionQuery]);

  // Outside-click + Escape dismiss any open menu (the popovers themselves are
  // presentational and don't self-manage dismissal).
  useEffect(() => {
    if (menu === "none") return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menu, closeMenu]);

  /* ----------------------------- editor state ---------------------------- */

  const recompute = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    setHasText(serialize(el).length > 0);
  }, []);

  /* --------------------------- draft persistence -------------------------- */

  // Seed the editor from the saved draft on mount and whenever the active chat
  // changes. Drafts are stored as plain text, so we restore them as the
  // editor's text content (pills aren't re-hydrated — matching the store's
  // plain-text contract). Persist the previous chat's draft on switch/unmount.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const saved = getLayout(sessionId).draft ?? "";
    el.textContent = saved;
    setHasText(saved.length > 0);
    // Flush any pending debounced write for the outgoing chat.
    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      const cur = editorRef.current;
      if (cur) patchLayout(sessionId, { draft: serialize(cur) });
    };
    // Re-seed only when the target chat changes; getLayout/patchLayout are
    // stable store actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  /** Debounced persist of the current editor draft (~300ms). */
  const persistDraftDebounced = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const el = editorRef.current;
      if (el) patchLayout(sessionId, { draft: serialize(el) });
    }, 300);
  }, [sessionId, patchLayout]);

  /** Insert a node at the current caret, then place the caret after it. */
  const insertAtCaret = useCallback(
    (node: Node) => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      let range: Range;
      if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
        range = sel.getRangeAt(0);
      } else {
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
      }
      range.deleteContents();
      range.insertNode(node);
      const after = document.createTextNode(" ");
      node.parentNode?.insertBefore(after, node.nextSibling);
      range.setStartAfter(after);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
      recompute();
    },
    [recompute]
  );

  /** Delete the active "/" or "@" trigger token immediately left of the caret. */
  const removeTriggerToken = useCallback((trigger: string, query: string) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const offset = range.startOffset;
    const tokenLen = trigger.length + query.length;
    const start = Math.max(0, offset - tokenLen);
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, offset);
    r.deleteContents();
    const collapsed = document.createRange();
    collapsed.setStart(node, start);
    collapsed.collapse(true);
    sel.removeAllRanges();
    sel.addRange(collapsed);
  }, []);

  /* -------------------------- trigger detection -------------------------- */

  const detectTriggers = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
      if (menu === "slash" || menu === "mention") closeMenu();
      return;
    }
    const textNode = range.startContainer as Text;
    const upto = textNode.textContent?.slice(0, range.startOffset) ?? "";

    // @mention: last "@" with no whitespace after it.
    const at = upto.lastIndexOf("@");
    if (at >= 0 && !/\s/.test(upto.slice(at + 1))) {
      const before = upto[at - 1];
      if (at === 0 || before === " " || before === " ") {
        setMentionQuery(upto.slice(at + 1));
        setMenu("mention");
        return;
      }
    }

    // /slash: only at the very start of the line.
    if (upto.startsWith("/") && !/\s/.test(upto.slice(1))) {
      const prev = textNode.previousSibling as HTMLElement | null;
      const atLineStart =
        !prev || prev.tagName === "BR" || prev.tagName === "DIV";
      if (atLineStart) {
        setMenu("slash");
        return;
      }
    }

    if (menu === "slash" || menu === "mention") closeMenu();
  }, [menu, closeMenu]);

  const onInput = useCallback(() => {
    recompute();
    detectTriggers();
    persistDraftDebounced();
  }, [recompute, detectTriggers, persistDraftDebounced]);

  /* ------------------------------ handlers ------------------------------- */

  /** Add any files (images, text, PDFs, …). Each is read to a data URL and
   *  appended as an attachment. Non-image / non-text files (PDF, binaries)
   *  auto-open in the right sidebar's Preview tab on add. */
  const addFiles = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach((file) => {
        const name = file.name || "file";
        const mime = file.type || "";
        const kind = classifyFile(name, mime);
        const reader = new FileReader();
        reader.onload = () => {
          const url = String(reader.result);
          setImages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              url,
              name,
              kind,
              mime,
            },
          ]);
          // Non-image/non-text (e.g. PDF) opens in the sidebar automatically.
          if (kind === "other") onOpenInPanel?.({ name, url, mime });
        };
        reader.readAsDataURL(file);
      });
    },
    [onOpenInPanel]
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const files = Array.from(e.clipboardData.files);
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
        return;
      }
      // Force plain-text paste so no foreign markup enters the editor.
      e.preventDefault();
      document.execCommand(
        "insertText",
        false,
        e.clipboardData.getData("text/plain")
      );
    },
    [addFiles]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  /** Delegated click on the editor: handle pill "×" removal. */
  const onEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.dataset.pillRemove) {
        e.preventDefault();
        target.closest("[data-pill]")?.remove();
        recompute();
      }
    },
    [recompute]
  );

  const doSend = useCallback(() => {
    const el = editorRef.current;
    if (!el || !canSend) return;
    onSend({
      text: serialize(el),
      images: images.map((i) => i.url),
      model,
      permissionMode: permission,
    });
    el.innerHTML = "";
    setImages([]);
    setHasText(false);
    closeMenu();
    // Sent successfully → drop the persisted draft for this chat.
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    patchLayout(sessionId, { draft: "" });
  }, [canSend, images, model, permission, onSend, closeMenu, patchLayout, sessionId]);

  /* --------------------------- menu selections --------------------------- */

  const onSlashPick = useCallback(
    (item: SlashItem) => {
      // The "/" that opened the menu still sits at the caret; drop it, then
      // insert the chosen command/skill name as plain text.
      removeTriggerToken("/", "");
      const name = item.kind === "skill" ? item.skill.name : item.id;
      document.execCommand("insertText", false, `/${name} `);
      closeMenu();
      recompute();
    },
    [removeTriggerToken, closeMenu, recompute]
  );

  const onMentionPick = useCallback(
    (file: MentionFile) => {
      removeTriggerToken("@", mentionQuery);
      const path = file.path ? `${file.path}/${file.name}` : file.name;
      insertAtCaret(makePill("mention", path, file.name));
      closeMenu();
    },
    [mentionQuery, removeTriggerToken, insertAtCaret, closeMenu]
  );

  const onAddPick = useCallback(
    (item: AddItem) => {
      if (item.kind === "action") {
        if (item.id === "files") {
          fileInputRef.current?.click();
        } else if (item.id === "folder") {
          folderInputRef.current?.click();
        } else if (item.id === "goal" || item.id === "plan") {
          insertAtCaret(makePill("context", item.id, item.title));
        }
        // Other actions (record) are UI-only placeholders for now.
      } else {
        insertAtCaret(makePill("context", item.plugin.id, item.plugin.name));
      }
      closeMenu();
    },
    [insertAtCaret, closeMenu]
  );

  const toggle = useCallback(
    (m: OpenMenu) => setMenu((cur) => (cur === m ? "none" : m)),
    []
  );

  /** Commit the currently-highlighted item of the open typeahead menu. */
  const pickActiveTypeahead = useCallback(() => {
    const item = typeaheadItems[activeIndex];
    if (!item) return;
    if (menu === "slash") onSlashPick(item as SlashItem);
    else if (menu === "mention") onMentionPick(item as MentionFile);
    else if (menu === "add") onAddPick(item as AddItem);
  }, [
    menu,
    activeIndex,
    typeaheadItems,
    onSlashPick,
    onMentionPick,
    onAddPick,
  ]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const typeaheadOpen =
        menu === "slash" || menu === "mention" || menu === "add";

      // While a typeahead menu is open, arrows/enter/escape drive the menu
      // (not the editor). Focus stays in the contentEditable so typing keeps
      // filtering the list.
      if (typeaheadOpen && typeaheadItems.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % typeaheadItems.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex(
            (i) => (i - 1 + typeaheadItems.length) % typeaheadItems.length
          );
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          pickActiveTypeahead();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeMenu();
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    },
    [menu, typeaheadItems, pickActiveTypeahead, closeMenu, doSend]
  );

  const placeholderVisible = !hasText && images.length === 0;

  const folderName = cwd ? cwdBasename(cwd) : null;
  // The context bar only makes sense once a session (cwd) is active.
  const showContextBar = Boolean(folderName);

  return (
    <div ref={rootRef} className="shrink-0 pb-2.5">
      <div className="mx-auto w-full max-w-[896px] px-8">
        <div className="w-full">
          {/* Context bar — its own rounded surface (bg + border + padding) that
              tucks behind the input's rounded top so the two read as one stacked
              card. "Local" is implied (always local) so it isn't shown. */}
          {showContextBar ? (
            <div
              className={[
                "relative z-0 mx-1 flex items-center gap-4 rounded-t-[16px] border border-b-0 border-panel-border bg-composer-bg px-4 pb-5 pt-2.5 text-text-strong backdrop-blur-xl",
                // Pull the input up so it overlaps the bottom of this bar.
                "-mb-3",
              ].join(" ")}
            >
              <span className="flex min-w-0 items-center gap-2">
                <FolderIcon
                  width={17}
                  height={17}
                  className="shrink-0 text-text-strong"
                />
                <span className="truncate text-[15px] font-medium leading-5">
                  {folderName}
                </span>
              </span>
              {gitBranch ? (
                <span className="flex min-w-0 items-center gap-2">
                  <GitBranchIcon
                    width={17}
                    height={17}
                    className="shrink-0 text-text-strong"
                  />
                  <span className="truncate text-[15px] font-medium leading-5">
                    {gitBranch}
                  </span>
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Input surface */}
          <div
            onMouseDown={(e) => {
              // Clicking anywhere on the surface (padding, empty area) focuses
              // the editor — but never steal mousedown from an interactive
              // control (buttons/pills) so those still work.
              const target = e.target as HTMLElement;
              if (
                target === editorRef.current ||
                target.closest("button") ||
                target.closest('[role="menu"]')
              ) {
                return;
              }
              e.preventDefault();
              editorRef.current?.focus();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setDragOver(false);
            }}
            onDrop={onDrop}
            className={[
              "relative z-10 rounded-[20px] bg-composer-bg backdrop-blur-xl transition-shadow",
              dragOver
                ? "shadow-[0px_0px_0px_2px_var(--agent-accent),0px_4px_6px_-1px_rgba(0,0,0,0.05)]"
                : "shadow-[0px_0px_0px_1px_var(--panel-border),0px_4px_6px_-1px_rgba(0,0,0,0.05),0px_2px_4px_-2px_rgba(0,0,0,0.05)]",
            ].join(" ")}
          >
            {/* Attachment row — image thumbnails (click → preview) and file
                cards (click → open in the right sidebar). */}
            {images.length > 0 ? (
              <div className="flex flex-wrap gap-2.5 px-4 pt-3">
                {images.map((att) =>
                  att.kind === "image" ? (
                    <div
                      key={att.id}
                      className="group relative size-16 overflow-hidden rounded-xl border border-panel-border bg-bubble-bg"
                    >
                      <button
                        type="button"
                        aria-label={`Preview ${att.name}`}
                        onClick={() => setPreviewImage(att)}
                        className="block size-full"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={att.url}
                          alt={att.name}
                          className="size-full object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${att.name}`}
                        onClick={() =>
                          setImages((prev) =>
                            prev.filter((i) => i.id !== att.id)
                          )
                        }
                        className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-btn-solid-bg text-btn-solid-text opacity-0 shadow transition-opacity group-hover:opacity-100"
                      >
                        <XIcon width={11} height={11} />
                      </button>
                    </div>
                  ) : (
                    <div
                      key={att.id}
                      className="group relative flex h-16 w-52 items-center gap-2.5 overflow-hidden rounded-xl border border-panel-border bg-bubble-bg px-3"
                    >
                      <button
                        type="button"
                        aria-label={`Open ${att.name}`}
                        onClick={() =>
                          onOpenInPanel?.({
                            name: att.name,
                            url: att.url,
                            mime: att.mime,
                          })
                        }
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <span
                          className={[
                            "flex size-9 shrink-0 items-center justify-center rounded-lg text-white",
                            att.kind === "text"
                              ? "bg-[#3b7dd8]"
                              : "bg-[#d64545]",
                          ].join(" ")}
                        >
                          <FileIcon width={18} height={18} />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13px] font-medium leading-4 text-text-strong">
                            {att.name}
                          </span>
                          <span className="text-[11px] leading-4 text-text-secondary">
                            {att.kind === "text" ? "Text" : "File"}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${att.name}`}
                        onClick={() =>
                          setImages((prev) =>
                            prev.filter((i) => i.id !== att.id)
                          )
                        }
                        className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-btn-solid-bg text-btn-solid-text opacity-0 shadow transition-opacity group-hover:opacity-100"
                      >
                        <XIcon width={11} height={11} />
                      </button>
                    </div>
                  )
                )}
              </div>
            ) : null}

            {/* Editable input */}
            <div className="relative">
              {placeholderVisible ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-4 top-3 text-[15px] leading-[22.75px] text-text-secondary"
                >
                  {isGenerating ? "Add to queue…" : "Do anything"}
                </span>
              ) : null}
              <div
                ref={editorRef}
                role="textbox"
                aria-multiline="true"
                aria-label="Message Claude"
                contentEditable={!disabled}
                suppressContentEditableWarning
                onInput={onInput}
                onKeyDown={onKeyDown}
                onKeyUp={detectTriggers}
                onPaste={onPaste}
                onClick={onEditorClick}
                className="max-h-[300px] min-h-[64px] w-full overflow-y-auto whitespace-pre-wrap break-words px-4 pt-3 pb-1 text-[15px] leading-[22.75px] text-text-strong outline-none [word-break:break-word]"
              />
            </div>

            {/* Bottom toolbar — INSIDE the surface. Left: add + permission.
                Right: model + effort + send. */}
            <div className="flex items-center gap-1 px-2 pb-2 pt-0.5">
              {/* Add */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  aria-label="Add attachment"
                  aria-haspopup="menu"
                  aria-expanded={menu === "add"}
                  onClick={() => toggle("add")}
                  className="flex size-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bubble-bg hover:text-text-strong"
                >
                  <PlusCircleIcon width={20} height={20} />
                </button>
                {menu === "add" ? (
                  <AddMenu
                    onPick={onAddPick}
                    onClose={closeMenu}
                    activeIndex={activeIndex}
                    className="bottom-10 left-0"
                  />
                ) : null}
              </div>

              {/* Permission */}
              <PermissionMenu
                value={permission}
                onChange={setPermission}
                trigger={
                  <PillButton
                    icon={
                      permission === "bypassPermissions" ? (
                        <SparkleIcon width={15} height={15} />
                      ) : (
                        <ShieldIcon width={15} height={15} />
                      )
                    }
                    label={permPill.label}
                    accent={permPill.accent}
                    chevron={false}
                    ariaLabel="Permission mode"
                  />
                }
              />

              {/* Spacer */}
              <div className="flex-1" />

              {/* Model + effort */}
              <ModelMenu
                value={model}
                options={MODEL_OPTIONS}
                onChange={(id) => setModel(id as ModelId)}
                trigger={
                  <PillButton
                    icon={<SparkleSingleIcon width={15} height={15} />}
                    label={modelLabel}
                    chevron={false}
                    ariaLabel="Model"
                  />
                }
              />
              <EffortMenu
                value={effort}
                modelLabel={modelLabel}
                onChange={setEffort}
                trigger={
                  <PillButton
                    label={effort ? effort : "Select effort"}
                    ariaLabel="Reasoning effort"
                  />
                }
              />

              {/* Send (or queue, while a turn is generating) */}
              <button
                type="button"
                aria-label={isGenerating ? "Queue message" : "Send message"}
                title={isGenerating ? "Queue message" : undefined}
                disabled={!canSend}
                onClick={doSend}
                className={[
                  "flex size-8 shrink-0 items-center justify-center rounded-full bg-btn-solid-bg text-btn-solid-text transition-opacity",
                  canSend ? "opacity-100" : "opacity-50",
                ].join(" ")}
              >
                <ArrowUpIcon width={18} height={18} />
              </button>
            </div>

            {/* Trigger menus, anchored above the input */}
            {menu === "slash" ? (
              <SlashMenu
                onPick={onSlashPick}
                onClose={closeMenu}
                activeIndex={activeIndex}
                className="bottom-full left-4 mb-2"
              />
            ) : null}
            {menu === "mention" ? (
              <MentionMenu
                query={mentionQuery}
                onPick={onMentionPick}
                onClose={closeMenu}
                activeIndex={activeIndex}
                className="bottom-full left-4 mb-2"
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Image preview lightbox — click a thumbnail to open the full image. */}
      {previewImage ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewImage.name}`}
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-h-full max-w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close preview"
              onClick={() => setPreviewImage(null)}
              className="absolute -right-3 -top-3 flex size-8 items-center justify-center rounded-full bg-btn-solid-bg text-btn-solid-text shadow-lg"
            >
              <XIcon width={14} height={14} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-h-[80vh] max-w-[80vw] rounded-xl object-contain shadow-2xl"
            />
            <p className="mt-3 text-center text-sm text-white/80">
              {previewImage.name}
            </p>
          </div>
        </div>
      ) : null}

      {/* Hidden inputs for the "Files" (any type) + "Folder" add actions. */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        // Non-standard but widely supported directory picker.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* cwd is accepted for future file-listing integrations. */}
      {cwd ? <span hidden data-cwd={cwd} /> : null}
    </div>
  );
}
