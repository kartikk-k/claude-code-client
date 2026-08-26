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

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MicIcon,
  ArrowUpIcon,
  PlusCircleIcon,
  ShieldIcon,
  SparkleIcon,
  ChevronDownIcon,
  XIcon,
  CheckIcon,
} from "../chat/components/icons";
import {
  Popover,
  MenuRow,
  PermissionMenu,
  SlashMenu,
  MentionMenu,
  AddMenu,
  type PermissionValue,
  type SlashItem,
  type MentionFile,
  type AddItem,
} from "./composer/Popovers";

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
  disabled?: boolean;
  cwd?: string;
};

type Thumb = { id: string; url: string; name: string };
type OpenMenu = "none" | "permission" | "model" | "slash" | "mention" | "add";

const EFFORT_OPTIONS = ["High", "Medium", "Low"] as const;

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
/* Local ModelMenu (built from the exported Popover primitives)               */
/* -------------------------------------------------------------------------- */

function ModelMenu({
  value,
  onChange,
  onClose,
  className = "",
}: {
  value: string;
  onChange: (id: string) => void;
  onClose: () => void;
  className?: string;
}) {
  return (
    <Popover className={["min-w-[240px]", className].join(" ")}>
      {MODEL_OPTIONS.map((m) => (
        <MenuRow
          key={m.id}
          icon={<SparkleIcon width={16} height={16} />}
          title={m.label}
          description={m.sub}
          descriptionAlign="below"
          active={m.id === value}
          trailing={
            m.id === value ? (
              <CheckIcon width={16} height={16} className="text-text-strong" />
            ) : undefined
          }
          onClick={() => {
            onChange(m.id);
            onClose();
          }}
        />
      ))}
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/* Toolbar pill                                                                */
/* -------------------------------------------------------------------------- */

function PillButton({
  icon,
  label,
  chevron = true,
  accent = false,
  onClick,
  ariaLabel,
  ariaExpanded,
}: {
  icon?: React.ReactNode;
  label?: string;
  chevron?: boolean;
  accent?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  ariaExpanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-haspopup="menu"
      aria-expanded={ariaExpanded}
      className={[
        "flex h-7 items-center justify-center gap-1 rounded-full border-[0.556px] border-transparent px-2.5 transition-colors hover:bg-bubble-bg",
        accent ? "text-[color:var(--agent-accent)]" : "text-text-secondary",
      ].join(" ")}
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
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export function RichComposer({ onSend, disabled = false, cwd }: RichComposerProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [images, setImages] = useState<Thumb[]>([]);
  const [hasText, setHasText] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [model, setModel] = useState("sonnet");
  const [effort, setEffort] = useState<(typeof EFFORT_OPTIONS)[number]>("High");
  const [permission, setPermission] = useState<PermissionValue>("plan");

  const [menu, setMenu] = useState<OpenMenu>("none");
  const [mentionQuery, setMentionQuery] = useState("");

  const permPill = PERMISSION_PILL[permission];
  const modelLabel =
    MODEL_OPTIONS.find((m) => m.id === model)?.label ?? "Claude Sonnet 5";
  const canSend = !disabled && (hasText || images.length > 0);

  const closeMenu = useCallback(() => {
    setMenu("none");
    setMentionQuery("");
  }, []);

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
  }, [recompute, detectTriggers]);

  /* ------------------------------ handlers ------------------------------- */

  const addImageFiles = useCallback((files: FileList | File[]) => {
    Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          const url = String(reader.result);
          setImages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              url,
              name: file.name || "image",
            },
          ]);
        };
        reader.readAsDataURL(file);
      });
  }, []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const imgs = Array.from(e.clipboardData.files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (imgs.length > 0) {
        e.preventDefault();
        addImageFiles(imgs);
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
    [addImageFiles]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) addImageFiles(e.dataTransfer.files);
    },
    [addImageFiles]
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
  }, [canSend, images, model, permission, onSend, closeMenu]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    },
    [doSend]
  );

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
        } else if (item.id === "goal" || item.id === "plan") {
          insertAtCaret(makePill("context", item.id, item.title));
        }
        // Other actions (appshot, record) are UI-only placeholders for now.
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

  const placeholderVisible = !hasText && images.length === 0;

  return (
    <div ref={rootRef} className="shrink-0 pb-2.5">
      <div className="mx-auto w-full max-w-[896px] px-8">
        <div className="w-full">
          {/* Input surface */}
          <div
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
              "relative rounded-[20px] bg-composer-bg transition-shadow",
              dragOver
                ? "shadow-[0px_0px_0px_2px_var(--agent-accent),0px_4px_6px_-1px_rgba(0,0,0,0.05)]"
                : "shadow-[0px_0px_0px_1px_var(--panel-border),0px_4px_6px_-1px_rgba(0,0,0,0.05),0px_2px_4px_-2px_rgba(0,0,0,0.05)]",
            ].join(" ")}
          >
            {/* Thumbnail row */}
            {images.length > 0 ? (
              <div className="flex flex-wrap gap-2 px-[42px] pt-3">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="group relative size-14 overflow-hidden rounded-lg border border-panel-border bg-bubble-bg"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.name}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${img.name}`}
                      onClick={() =>
                        setImages((prev) => prev.filter((i) => i.id !== img.id))
                      }
                      className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-btn-solid-bg text-btn-solid-text opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <XIcon width={10} height={10} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Editable input */}
            <div className="relative">
              {placeholderVisible ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-[42px] top-2 text-sm leading-[22.75px] text-text-secondary"
                >
                  Reply to Claude…
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
                className="max-h-[357px] min-h-[38.7px] w-full overflow-y-auto whitespace-pre-wrap break-words px-[42px] py-2 text-sm leading-[22.75px] text-text-strong outline-none [word-break:break-word]"
              />
            </div>

            {/* Add (left) */}
            <div className="absolute left-[5px] top-[5.75px]">
              <button
                type="button"
                aria-label="Add attachment"
                aria-haspopup="menu"
                aria-expanded={menu === "add"}
                onClick={() => toggle("add")}
                className="flex size-7 items-center justify-center rounded-full border-[0.556px] border-transparent bg-bubble-bg text-text-secondary transition-colors hover:text-text-strong"
              >
                <PlusCircleIcon width={16} height={16} />
              </button>
              {menu === "add" ? (
                <AddMenu
                  onPick={onAddPick}
                  onClose={closeMenu}
                  className="bottom-9 left-0"
                />
              ) : null}
            </div>

            {/* Mic + Send (right) */}
            <div className="absolute right-[5px] top-[5.75px] flex items-center gap-1">
              <button
                type="button"
                aria-label="Dictate"
                className="flex size-7 items-center justify-center rounded-full border-[0.556px] border-transparent text-text-secondary transition-colors hover:bg-bubble-bg hover:text-text-strong"
              >
                <MicIcon />
              </button>
              <button
                type="button"
                aria-label="Send message"
                disabled={!canSend}
                onClick={doSend}
                className={[
                  "flex size-7 items-center justify-center rounded-full bg-btn-solid-bg text-btn-solid-text transition-opacity",
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
                className="bottom-full left-[42px] mb-2"
              />
            ) : null}
            {menu === "mention" ? (
              <MentionMenu
                query={mentionQuery}
                onPick={onMentionPick}
                onClose={closeMenu}
                className="bottom-full left-[42px] mb-2"
              />
            ) : null}
          </div>

          {/* Toolbar */}
          <div className="flex items-center py-1">
            <div className="relative flex flex-1 items-center">
              <PillButton
                icon={
                  permission === "bypassPermissions" ? (
                    <SparkleIcon width={14} height={14} />
                  ) : (
                    <ShieldIcon width={14} height={14} />
                  )
                }
                label={permPill.label}
                accent={permPill.accent}
                ariaLabel="Permission mode"
                ariaExpanded={menu === "permission"}
                onClick={() => toggle("permission")}
              />
              {menu === "permission" ? (
                <PermissionMenu
                  value={permission}
                  onChange={setPermission}
                  onClose={closeMenu}
                  className="bottom-full left-0 mb-2"
                />
              ) : null}
            </div>

            <div className="flex items-center">
              <div className="relative flex items-center">
                <PillButton
                  icon={<SparkleIcon width={14} height={14} />}
                  label={modelLabel}
                  ariaLabel="Model"
                  ariaExpanded={menu === "model"}
                  onClick={() => toggle("model")}
                />
                {menu === "model" ? (
                  <ModelMenu
                    value={model}
                    onChange={setModel}
                    onClose={closeMenu}
                    className="bottom-full right-0 mb-2"
                  />
                ) : null}
              </div>
              <PillButton
                chevron={false}
                label={effort}
                ariaLabel="Reasoning effort"
                onClick={() =>
                  setEffort((cur) => {
                    const idx = EFFORT_OPTIONS.indexOf(cur);
                    return EFFORT_OPTIONS[(idx + 1) % EFFORT_OPTIONS.length];
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input for the "Files and folders" add action */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) addImageFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* cwd is accepted for future file-listing integrations. */}
      {cwd ? <span hidden data-cwd={cwd} /> : null}
    </div>
  );
}
