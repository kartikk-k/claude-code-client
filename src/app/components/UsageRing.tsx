/**
 * Circular usage indicator. Draws a ring whose filled arc represents how much
 * usage is *left* (0–100). The stroke color shifts by remaining headroom:
 *   > 60%        green   (plenty left)
 *   20–60%       blue    (moderate)
 *   < 20%        amber   (running low)
 */

/** Color for a given "percent left" value. Exported so callers can match it. */
export function usageColor(pctLeft: number): string {
  if (pctLeft > 60) return "#00bc7d"; // green
  if (pctLeft >= 20) return "#3b9eff"; // blue
  return "#f5a524"; // amber
}

export function UsageRing({
  /** Percentage of usage remaining, 0–100. */
  pctLeft,
  size = 16,
  strokeWidth = 2,
  className,
}: {
  pctLeft: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pctLeft));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;
  const color = usageColor(clamped);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Rotated -90deg so the arc starts at 12 o'clock and sweeps clockwise. */}
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-control-border"
        />
        {/* progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </g>
    </svg>
  );
}
