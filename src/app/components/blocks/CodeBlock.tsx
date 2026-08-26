"use client";

import { useState } from "react";
import { CopyIcon, CheckIcon } from "../../chat/components/icons";

/**
 * Fenced code block with a language header + copy button.
 *
 * Token coloring is intentionally minimal — a handful of forgiving regexes over
 * the raw string, never a real parser — so it degrades gracefully on partial /
 * streaming text and cannot throw. Everything is HTML-escaped before we inject
 * the colored spans.
 */

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "do", "switch", "case", "break", "continue", "new", "class", "extends",
  "super", "this", "import", "export", "from", "default", "async", "await",
  "yield", "try", "catch", "finally", "throw", "typeof", "instanceof", "in",
  "of", "void", "delete", "null", "undefined", "true", "false", "public",
  "private", "protected", "static", "interface", "type", "enum", "implements",
  "def", "elif", "lambda", "None", "True", "False", "and", "or", "not", "pass",
  "with", "as", "raise", "global", "nonlocal", "fn", "let", "mut", "pub",
  "struct", "impl", "trait", "match", "use", "mod", "package", "func", "go",
  "defer", "select", "chan", "map", "range", "nil",
]);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Returns HTML with token spans. Operates on already-escaped text and tokenizes
 * with a single alternation so matches never overlap. Falls back to the plain
 * escaped string if anything goes wrong.
 */
function highlight(code: string): string {
  try {
    const escaped = escapeHtml(code);
    // Order matters: comments & strings first so their contents aren't
    // re-tokenized as keywords/numbers.
    const pattern =
      /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;
    return escaped.replace(
      pattern,
      (match, comment, str, num, word) => {
        if (comment) return `<span class="text-code-comment">${match}</span>`;
        if (str) return `<span class="text-code-string">${match}</span>`;
        if (num) return `<span class="text-code-number">${match}</span>`;
        if (word && KEYWORDS.has(word))
          return `<span class="text-code-keyword">${match}</span>`;
        return match;
      }
    );
  } catch {
    return escapeHtml(code);
  }
}

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    try {
      navigator.clipboard?.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  const label = (lang || "").trim();

  return (
    <div className="my-2 overflow-hidden rounded-[8.4px] border border-card-border">
      <div className="flex items-center justify-between bg-code-header-bg px-3 py-1.5">
        <span className="font-mono text-[12px] leading-4 text-text-secondary">
          {label || "text"}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy code"
          className="flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[12px] text-text-secondary transition-colors hover:text-text-strong"
        >
          {copied ? (
            <CheckIcon width={14} height={14} />
          ) : (
            <CopyIcon width={14} height={14} />
          )}
        </button>
      </div>
      <pre className="overflow-x-auto bg-code-bg px-3 py-2.5 font-mono text-[13px] leading-[1.5] text-code-text">
        <code dangerouslySetInnerHTML={{ __html: highlight(code) }} />
      </pre>
    </div>
  );
}
