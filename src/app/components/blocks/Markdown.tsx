"use client";

import { Fragment, memo, useMemo, useState, type ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";

/**
 * An inline image, rendered the way GitHub renders badges: a small (~20px tall)
 * inline `<img>` that sits on the text baseline. Most PR-body images are
 * shields.io badges, so this keeps them compact and inline rather than blowing
 * up to full width. If the image can't load (offline, 404, blocked host) we
 * fall back to the alt text so the reader still sees what the badge said.
 */
function Badge({ alt, src }: { alt: string; src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="rounded bg-code-bg px-1 font-mono text-[0.8em] text-text-secondary">
        {alt || "image"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="inline-block h-5 max-w-full rounded align-text-bottom"
    />
  );
}

/**
 * Lightweight, dependency-free Markdown renderer.
 *
 * Deliberately small: it handles the subset of GitHub-flavored Markdown that
 * shows up in Claude Code transcripts — headings, emphasis, inline code, links,
 * lists, blockquotes, rules, pipe tables, and fenced code blocks — and is
 * robust to partial / streaming text (an unterminated ``` fence still renders
 * its captured body as code). All text is escaped by React (we never inject
 * raw HTML), so it is XSS-safe by construction.
 */

/* ------------------------------------------------------------------ inline */

let keySeq = 0;
function k(): string {
  return `md-${keySeq++}`;
}

/** Parse inline spans: code, bold, italic, links. Returns React nodes. */
function parseInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;

  // Ordered token matchers. Inline code wins first so its contents are literal.
  const tokens: {
    re: RegExp;
    render: (m: RegExpExecArray) => ReactNode;
  }[] = [
    {
      re: /`([^`]+)`/,
      render: (m) => (
        <code
          key={k()}
          className="rounded bg-code-bg px-1 font-mono text-[0.85em] text-code-text"
        >
          {m[1]}
        </code>
      ),
    },
    {
      // Linked image (a badge that navigates): [![alt](imgUrl)](linkUrl).
      // Must come before the plain-image and link tokens so the wrapping
      // link + inner image are captured as one unit, matching GitHub badges.
      re: /\[!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/,
      render: (m) => (
        <a
          key={k()}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="mr-1 inline-block align-text-bottom"
        >
          <Badge alt={m[1]} src={m[2]} />
        </a>
      ),
    },
    {
      // Standalone image: ![alt](url). Rendered as an inline badge-style <img>
      // (shields.io badges etc. render exactly as on GitHub).
      re: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/,
      render: (m) => <Badge key={k()} alt={m[1]} src={m[2]} />,
    },
    {
      re: /\*\*([^*]+)\*\*/,
      render: (m) => (
        <strong key={k()} className="font-semibold text-text-strong">
          {parseInline(m[1])}
        </strong>
      ),
    },
    {
      re: /__([^_]+)__/,
      render: (m) => (
        <strong key={k()} className="font-semibold text-text-strong">
          {parseInline(m[1])}
        </strong>
      ),
    },
    {
      re: /\*([^*]+)\*/,
      render: (m) => (
        <em key={k()} className="italic">
          {parseInline(m[1])}
        </em>
      ),
    },
    {
      re: /_([^_]+)_/,
      render: (m) => (
        <em key={k()} className="italic">
          {parseInline(m[1])}
        </em>
      ),
    },
    {
      re: /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/,
      render: (m) => (
        <a
          key={k()}
          href={m[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link underline"
        >
          {parseInline(m[1])}
        </a>
      ),
    },
    {
      // bare URLs
      re: /(https?:\/\/[^\s<)]+)/,
      render: (m) => (
        <a
          key={k()}
          href={m[1]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link underline"
        >
          {m[1]}
        </a>
      ),
    },
  ];

  // Repeatedly find the earliest-matching token in the remaining string.
  // Guarded loop so a pathological input can never spin forever.
  let guard = 0;
  while (rest.length > 0 && guard++ < 10000) {
    let best: { index: number; match: RegExpExecArray; idx: number } | null =
      null;
    for (let i = 0; i < tokens.length; i++) {
      const m = tokens[i].re.exec(rest);
      if (m && (best === null || m.index < best.index)) {
        best = { index: m.index, match: m, idx: i };
      }
    }
    if (!best) {
      out.push(rest);
      break;
    }
    if (best.index > 0) out.push(rest.slice(0, best.index));
    out.push(tokens[best.idx].render(best.match));
    rest = rest.slice(best.index + best.match[0].length);
  }
  return out;
}

/* ------------------------------------------------------------------- block */

type Segment =
  | { type: "code"; lang?: string; code: string }
  | { type: "md"; text: string };

/** Split raw text into fenced-code and markdown segments. Streaming-safe: an
 *  unclosed fence still emits its captured body as a code segment. */
function splitFences(src: string): Segment[] {
  const segs: Segment[] = [];
  const lines = src.split("\n");
  let i = 0;
  let mdBuf: string[] = [];

  const flushMd = () => {
    if (mdBuf.length) {
      segs.push({ type: "md", text: mdBuf.join("\n") });
      mdBuf = [];
    }
  };

  while (i < lines.length) {
    const fence = /^\s*```(.*)$/.exec(lines[i]);
    if (fence) {
      flushMd();
      const lang = fence[1].trim() || undefined;
      const body: string[] = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        if (/^\s*```\s*$/.test(lines[i])) {
          closed = true;
          i++;
          break;
        }
        body.push(lines[i]);
        i++;
      }
      // whether or not the closing fence arrived, render what we have
      void closed;
      segs.push({ type: "code", lang, code: body.join("\n") });
      continue;
    }
    mdBuf.push(lines[i]);
    i++;
  }
  flushMd();
  return segs;
}

function isTableSep(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/** Render a markdown segment (no fences) into block-level React nodes. */
function renderMarkdown(text: string): ReactNode[] {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // blank line
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={k()} className="my-3 border-row-divider" />);
      i++;
      continue;
    }

    // heading
    const h = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const content = parseInline(h[2].trim());
      const cls = [
        "font-semibold text-text-strong",
        level <= 1
          ? "mt-4 mb-2 text-[18px] leading-6"
          : level === 2
            ? "mt-4 mb-1.5 text-[16px] leading-6"
            : "mt-3 mb-1 text-[14px] leading-5",
      ].join(" ");
      const Tag = (`h${level}` as unknown) as keyof React.JSX.IntrinsicElements;
      blocks.push(
        <Tag key={k()} className={cls}>
          {content}
        </Tag>
      );
      i++;
      continue;
    }

    // table: header line followed by a separator line
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSep(lines[i + 1])
    ) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].includes("|") &&
        !/^\s*$/.test(lines[i])
      ) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(
        <div key={k()} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {header.map((c) => (
                  <th
                    key={k()}
                    className="border-b border-row-divider px-3 py-1.5 text-left font-medium text-text-secondary"
                  >
                    {parseInline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={k()}>
                  {r.map((c) => (
                    <td
                      key={k()}
                      className="border-b border-row-divider px-3 py-1.5 align-top text-text-primary"
                    >
                      {parseInline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote
          key={k()}
          className="my-2 border-l-2 border-row-divider pl-3 text-text-secondary"
        >
          {renderMarkdown(quote.join("\n"))}
        </blockquote>
      );
      continue;
    }

    // unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const content = lines[i].replace(/^\s*[-*+]\s+/, "");
        items.push(
          <li key={k()} className="ml-5 list-disc py-0.5">
            {parseInline(content)}
          </li>
        );
        i++;
      }
      blocks.push(
        <ul key={k()} className="my-1.5 text-sm leading-5 text-text-primary">
          {items}
        </ul>
      );
      continue;
    }

    // ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        const content = lines[i].replace(/^\s*\d+[.)]\s+/, "");
        items.push(
          <li key={k()} className="ml-5 list-decimal py-0.5">
            {parseInline(content)}
          </li>
        );
        i++;
      }
      blocks.push(
        <ol key={k()} className="my-1.5 text-sm leading-5 text-text-primary">
          {items}
        </ol>
      );
      continue;
    }

    // paragraph: gather consecutive non-blank, non-structural lines
    const para: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s*(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) &&
      !(
        lines[i].includes("|") &&
        i + 1 < lines.length &&
        isTableSep(lines[i + 1])
      )
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) {
      blocks.push(
        <p
          key={k()}
          className="my-1.5 whitespace-pre-wrap text-sm leading-5 text-text-primary first:mt-0 last:mb-0"
        >
          {parseInline(para.join("\n"))}
        </p>
      );
    }
  }

  return blocks;
}

/**
 * Memoized so an unchanged message never re-parses. This matters a lot: the
 * message list re-renders on every streamed token, but each durable message's
 * `text` is stable, so `memo` skips it entirely. Only the actively-streaming
 * bubble (whose `text` grows) actually re-parses. The `useMemo` additionally
 * caches the parse across any re-render that does slip through (e.g. a parent
 * context change) so the hand-rolled parser + regex passes run once per text.
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const content = useMemo(() => {
    if (!text) return null;
    const segments = splitFences(text);
    return segments.map((seg) =>
      seg.type === "code" ? (
        <CodeBlock key={k()} code={seg.code} lang={seg.lang} />
      ) : (
        <Fragment key={k()}>{renderMarkdown(seg.text)}</Fragment>
      )
    );
  }, [text]);
  if (content === null) return null;
  return <div className="text-text-primary">{content}</div>;
});
