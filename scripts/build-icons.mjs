/**
 * Copies the required Nucleo UI (Outline, 18px) icons out of the local Nucleo
 * library into public/icons/, normalizing them to use `currentColor` so they
 * inherit text color. Run with: bun scripts/build-icons.mjs  (or node).
 *
 * Nucleo layout: ~/.claude-independent — actually:
 *   ~/Library/Application Support/Nucleo/icons/data.sqlite3   (index)
 *   ~/Library/Application Support/Nucleo/icons/sets/<set_id>/<icon_id>.svg
 * An icon's SVG file is sets/<set_id>/<icon.id>.svg.
 */
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { Database } from "bun:sqlite";

const NUCLEO = join(
  homedir(),
  "Library/Application Support/Nucleo/icons"
);
const DB_PATH = join(NUCLEO, "data.sqlite3");
const OUT = join(dirname(new URL(import.meta.url).pathname), "..", "public", "icons");

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
  share: ["share", "share-up"],
  star: ["star"],
  pin: ["pin", "thumbtack"],
  clock: ["clock"],
  cube: ["cube"],
  plug: ["plug"],
  grid: ["grid", "layout-grid"],
  at: ["at-sign", "at"],
  branch: ["git-branch", "branch"],
  target: ["target", "bullseye"],
  bulb: ["bulb", "lightbulb"],
  record: ["record", "circle-dot"],
  file: ["file", "file-text", "doc"],
  "sidebar": ["layout-right", "sidebar", "panel-right"],
  "expand": ["chevron-right", "caret-right"],
  globe: ["globe"],
  check: ["check"],
  x: ["e-remove", "close", "x"],
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
};

// Sets that carry the 18px outline family. Prefer 42 (UI/Layout) and 7
// (Nucleo UI Essential), then other 18px sets.
function get18pxSets(db) {
  const rows = db
    .query("SELECT id FROM sets WHERE sizes LIKE '%18%'")
    .all();
  const ids = rows.map((r) => r.id);
  // priority order
  const pref = [42, 7, 12, 17, 16, 11, 40];
  ids.sort((a, b) => {
    const ia = pref.indexOf(a);
    const ib = pref.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return ids;
}

function findIcon(db, sets, slugs) {
  const setList = sets.join(",");
  for (const slug of slugs) {
    // exact name match first, in set priority
    const exact = db
      .query(
        `SELECT set_id, id, name FROM icons WHERE set_id IN (${setList}) AND name = ? LIMIT 1`
      )
      .get(slug);
    if (exact) return exact;
  }
  for (const slug of slugs) {
    const like = db
      .query(
        `SELECT set_id, id, name FROM icons WHERE set_id IN (${setList}) AND (name LIKE ? OR nucleo_tags LIKE ?) ORDER BY length(name) LIMIT 1`
      )
      .get(`${slug}%`, `%${slug}%`);
    if (like) return like;
  }
  return null;
}

/** Normalize a Nucleo SVG to a single-color, currentColor icon.
 *  Nucleo icons are often two-tone: a solid primary layer + a lighter accent
 *  layer (fill-opacity ~0.4 or data-color="color-2"). We map every fill to
 *  currentColor and preserve any fill-opacity so the two-tone shape survives
 *  as a monochrome tint. Fixed width/height are stripped (viewBox scales). */
function normalize(svg) {
  return (
    svg
      // any explicit fill color -> currentColor (hex, named black, rgb)
      .replace(/fill="(#[0-9a-fA-F]{3,8}|black|#010101|rgb\([^)]*\))"/g,
        'fill="currentColor"')
      // drop Nucleo's multicolor hint attribute
      .replace(/\sdata-color="[^"]*"/g, "")
      // guarantee the root inherits currentColor
      .replace(/<svg /, '<svg fill="currentColor" ')
      // remove hardcoded pixel dimensions; viewBox drives sizing
      .replace(/\swidth="\d+(?:\.\d+)?"/g, "")
      .replace(/\sheight="\d+(?:\.\d+)?"/g, "")
  );
}

function main() {
  if (!existsSync(DB_PATH)) {
    console.error("Nucleo library not found at", DB_PATH);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const db = new Database(DB_PATH, { readonly: true });
  const sets = get18pxSets(db);

  const manifest = {};
  const missing = [];
  for (const [name, slugs] of Object.entries(MAP)) {
    const icon = findIcon(db, sets, slugs);
    if (!icon) {
      missing.push(name);
      continue;
    }
    const src = join(NUCLEO, "sets", String(icon.set_id), `${icon.id}.svg`);
    if (!existsSync(src)) {
      missing.push(`${name} (file ${src} missing)`);
      continue;
    }
    const svg = normalize(readFileSync(src, "utf8"));
    writeFileSync(join(OUT, `${name}.svg`), svg);
    manifest[name] = { slug: icon.name, set: icon.set_id, id: icon.id };
  }

  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(
    `wrote ${Object.keys(manifest).length} icons to public/icons/`
  );
  if (missing.length) console.warn("MISSING:", missing.join(", "));
}

main();
