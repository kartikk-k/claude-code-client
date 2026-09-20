/**
 * Builds the app's icon set from a local Nucleo UI export directory of
 * Outline / 18px SVGs, laid out as:
 *   <ICON_DIR>/<Category>/<slug>.svg
 * (e.g. "UI & Layout/bolt.svg"). Each source SVG is already
 * viewBox="0 0 18 18" and stroke/fill uses currentColor.
 *
 * For each semantic app icon name we resolve the first slug (from MAP) that
 * exists in the export, then emit three things:
 *   - public/icons/<name>.svg         (normalized standalone file)
 *   - public/icons/manifest.json      (name -> { slug, category })
 *   - src/app/lib/nucleo-icons.ts     (name -> { vb, inner }) consumed by <Icon>
 *
 * Run with: bun scripts/build-icons.mjs   (or node)
 * Override the source dir with ICON_DIR=... if needed.
 */
import { join, dirname, basename } from "node:path";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
} from "node:fs";

const ICON_DIR =
  process.env.ICON_DIR ||
  join(
    process.env.HOME || "",
    "Desktop",
    "Nucleo UI",
    "outline",
    "18px"
  );
const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const OUT = join(ROOT, "public", "icons");
const TS_OUT = join(ROOT, "src", "app", "lib", "nucleo-icons.ts");

// Our semantic icon name -> Nucleo slug(s). First slug that resolves wins.
// All are outline/18px icons from the Nucleo UI family.
const MAP = {
  "new-chat": ["pen-writing", "pencil", "square-pen"],
  edit: ["pencil", "pen-writing"],
  search: ["magnifier"],
  bell: ["bell", "notification"],
  folder: ["folder"],
  plus: ["plus", "e-add"],
  "circle-plus": ["circle-plus"],
  attach: ["paperclip"],
  mic: ["microphone"],
  "arrow-up": ["arrow-up"],
  send: ["paper-plane", "arrow-up"],
  "chevron-down": ["chevron-down", "caret-down"],
  "chevron-right": ["chevron-right", "caret-right"],
  copy: ["copy"],
  refresh: ["arrow-clockwise", "refresh", "arrows-reload"],
  shield: ["shield-check", "shield"],
  hand: ["hand-stop", "hand"],
  warning: ["triangle-warning"],
  trash: ["trash"],
  share: ["share", "export", "share-up"],
  star: ["star"],
  pin: ["pin", "thumbtack"],
  clock: ["clock"],
  cube: ["cube"],
  plug: ["plug"],
  grid: ["grid", "layout-grid"],
  at: ["at-sign", "at"],
  branch: ["git-branch", "code-fork", "branch"],
  target: ["target", "bullseye"],
  bulb: ["bulb", "lightbulb"],
  record: ["record", "circle-dot"],
  file: ["file", "file-text", "doc"],
  sidebar: ["layout-right", "sidebar", "panel-right"],
  expand: ["chevron-right", "caret-right"],
  globe: ["globe"],
  check: ["check"],
  x: ["e-remove", "close", "xmark", "x", "minus"],
  terminal: ["terminal", "code"],
  brain: ["brain", "head"],
  robot: ["robot", "android"],
  tool: ["settings-gear", "gear", "wrench"],
  book: ["book", "book-open"],
  sparkle: ["sparkle", "magic-wand", "stars"],
  link: ["link", "chain"],
  split: ["split", "layout-columns", "columns"],
  activity: ["activity", "pulse", "chart-activity"],
  card: ["card", "credit-card", "id-card"],
  compass: ["compass", "navigation"],
  usage: ["gauge", "meter", "speedometer"],
  dots: ["dots", "dots-horizontal", "dots-3"],
  gear: ["gear", "settings-gear", "cog"],
  logout: ["rect-logout", "circle-logout", "log-out", "exit-door"],
  "invite": ["users-plus", "user-plus", "user-add"],
};

/** Recursively index every <slug>.svg -> absolute path. First match wins,
 *  so category traversal order is deterministic (sorted). */
function indexIcons(dir) {
  const index = new Map();
  const categories = new Map(); // slug -> category (top-level folder)
  function walk(current, category) {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const e of entries) {
      const full = join(current, e.name);
      if (e.isDirectory()) {
        walk(full, category || e.name);
      } else if (e.isFile() && e.name.endsWith(".svg")) {
        const slug = basename(e.name, ".svg");
        if (!index.has(slug)) {
          index.set(slug, full);
          categories.set(slug, category || "");
        }
      }
    }
  }
  walk(dir, null);
  return { index, categories };
}

/** Normalize a Nucleo SVG so it inherits text color. Outline icons already use
 *  stroke="currentColor" / fill="none"; we also map any hardcoded fills to
 *  currentColor, drop the multicolor hint, and strip pixel dimensions so the
 *  viewBox alone drives sizing. */
function normalize(svg) {
  return svg
    .replace(
      /(fill|stroke)="(#[0-9a-fA-F]{3,8}|black|white|rgb\([^)]*\))"/g,
      '$1="currentColor"'
    )
    .replace(/\sdata-color="[^"]*"/g, "")
    .replace(/\swidth="[\d.]+"/g, "")
    .replace(/\sheight="[\d.]+"/g, "");
}

/** Pull viewBox + inner markup out of a normalized <svg> string. */
function extract(svg) {
  const vb = (svg.match(/viewBox="([^"]+)"/) || [, "0 0 18 18"])[1];
  const inner = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim();
  return { vb, inner };
}

function main() {
  if (!existsSync(ICON_DIR)) {
    console.error("Icon source dir not found at", ICON_DIR);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const { index, categories } = indexIcons(ICON_DIR);

  const manifest = {};
  const icons = {};
  const missing = [];

  for (const [name, slugs] of Object.entries(MAP)) {
    const slug = slugs.find((s) => index.has(s));
    if (!slug) {
      missing.push(`${name} (tried: ${slugs.join(", ")})`);
      continue;
    }
    const raw = readFileSync(index.get(slug), "utf8");
    const svg = normalize(raw);
    writeFileSync(join(OUT, `${name}.svg`), svg);
    const { vb, inner } = extract(svg);
    icons[name] = { vb, inner };
    manifest[name] = { slug, category: categories.get(slug) };
  }

  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

  const names = Object.keys(icons);
  const ts =
    "// AUTO-GENERATED. Nucleo UI (Outline, 18px), normalized to currentColor.\n" +
    "export const ICONS: Record<string, { vb: string; inner: string }> = " +
    JSON.stringify(icons) +
    ";\n" +
    "export type IconName = keyof typeof ICONS;\n";
  writeFileSync(TS_OUT, ts);

  console.log(
    `wrote ${names.length} icons to public/icons/ and ${TS_OUT.replace(ROOT + "/", "")}`
  );
  if (missing.length) console.warn("MISSING:", missing.join(", "));
}

main();
