/**
 * The rounded plugin tile (icon square) used in the Installed grid and as the
 * hero mark on the detail page. When a plugin has a brand `logo` (an SVG under
 * /public/plugins, downloaded from svgl.app), the tile renders that logo; the
 * fallback (no logo) is a neutral gray square with a short 2-letter mark. All
 * tiles share a soft neomorphic (embossed) treatment — a subtle top-down
 * gradient plus an inset highlight and a drop shadow — so they read as raised
 * 3D chips rather than flat squares. Logos are served same-origin, so they're
 * CSP-safe and work offline — no runtime fetch.
 */

/** Base surface for brand-logo tiles that have no background of their own. */
const TILE_BG = "rgba(0, 0, 0, 0.4)";
/** Shared surface for letter-mark tiles (no SVG icon) — one gray for all. */
const MARK_BG = "#5A5A5A";

/**
 * Neomorphic layering: a diagonal light→dark gradient for the raised face, an
 * inset top highlight + inset bottom shadow for the emboss, and a soft outer
 * drop shadow to lift the tile off the row.
 */
function neomorphic(base: string): {
  background: string;
  boxShadow: string;
} {
  return {
    background: `rgba(255, 255, 255, 0.1)`,
    boxShadow: [
      // "inset 0 1px 0 rgba(255,255,255,0.10)",
      // "inset 0 -1px 1px rgba(0,0,0,0.35)",
      // "0 2px 5px rgba(0,0,0,0.40)",
    ].join(", "),
  };
}

export function PluginTile({
  color,
  mark,
  logo,
  logoBg,
  size = 44,
  className = "",
}: {
  color: string;
  mark: string;
  /** Brand logo path under /public (e.g. "/plugins/github.svg"). */
  logo?: string;
  /**
   * Tile surface behind the logo: "dark" uses the brand `color` (for white
   * marks like GitHub / Notion); anything else uses the neutral dark surface.
   */
  logoBg?: "light" | "dark";
  size?: number;
  className?: string;
}) {
  const radius = Math.round(size * 0.27);

  if (logo) {
    // "dark" marks sit on the brand color; everything else on the neutral
    // surface (never white). Both get the neomorphic emboss.
    const base = logoBg === "dark" ? color : TILE_BG;
    const style = neomorphic(base);
    return (
      <span
        className={["flex shrink-0 items-center justify-center overflow-hidden", className].join(
          " "
        )}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: style.background,
          boxShadow: style.boxShadow,
        }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt=""
          width={Math.round(size * 0.6)}
          height={Math.round(size * 0.6)}
          style={{
            width: size * 0.6,
            height: size * 0.6,
            objectFit: "contain",
          }}
        />
      </span>
    );
  }

  // Fallback: a single neutral gray surface (same for every icon-less plugin),
  // medium-weight mark. Neomorphic to match the logo tiles.
  const style = neomorphic(MARK_BG);
  return (
    <span
      className={[
        "flex shrink-0 items-center justify-center font-medium text-white/90",
        className,
      ].join(" ")}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: style.background,
        boxShadow: style.boxShadow,
        fontSize: size * 0.34,
      }}
      aria-hidden="true"
    >
      {mark}
    </span>
  );
}

/** Darken/lighten a #rrggbb hex by a percentage (-100..100). */
function shade(hex: string, pct: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const num = parseInt(h, 16);
  const amt = Math.round(2.55 * pct);
  const r = clamp((num >> 16) + amt);
  const g = clamp(((num >> 8) & 0xff) + amt);
  const b = clamp((num & 0xff) + amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}
