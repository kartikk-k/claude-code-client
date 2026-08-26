import { ICONS, type IconName } from "../lib/nucleo-icons";

/**
 * Renders a Nucleo UI (Outline, 18px source) icon inline as SVG, inheriting
 * `currentColor`. Default render size is 16px; pass `size` (commonly 14 or 16)
 * to match the surrounding context.
 */
export function Icon({
  name,
  size = 16,
  className,
  ...rest
}: {
  name: IconName;
  size?: number;
  className?: string;
} & Omit<React.SVGProps<SVGSVGElement>, "name">) {
  const icon = ICONS[name];
  if (!icon) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={icon.vb}
      fill="currentColor"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.inner }}
      {...rest}
    />
  );
}

export type { IconName };
