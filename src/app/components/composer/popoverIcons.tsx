/**
 * Extra icons used by the composer popovers — backed by the Nucleo UI (Outline)
 * set via <Icon>, so call sites keep their existing props. Same pattern as
 * chat/components/icons.tsx.
 */
import { Icon, type IconName } from "../Icon";

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function make(nucleo: IconName) {
  const Comp = (p: IconProps) => <Icon name={nucleo} {...p} />;
  Comp.displayName = `Icon(${nucleo})`;
  return Comp;
}

export const AlertIcon = make("warning");
export const DocsIcon = make("file");
export const LinkIcon = make("link");
export const SplitIcon = make("split");
export const StarIcon = make("star");
export const ActivityIcon = make("activity");
export const CardIcon = make("card");
export const TargetIcon = make("target");
export const CompassIcon = make("compass");
export const RecordIcon = make("record");
export const BellIcon = make("bell");
export const BranchIcon = make("branch");
export const ClockIcon = make("clock");
export const CubeIcon = make("cube");
export const SearchIcon = make("search");
export const GlobeIcon = make("globe");
export const UsageIcon = make("usage");
