/**
 * Icon components for the app — backed by the Nucleo UI (Outline, 18px) set.
 * Each named export renders the corresponding Nucleo icon via <Icon>, so every
 * existing call site (`<SearchIcon className="size-4" />`, `<CopyIcon
 * width={14} height={14} />`) keeps working unchanged. Icons inherit
 * currentColor. Default render size 16px; callers pass size/className/width.
 *
 * The underlying SVGs are generated from the local Nucleo library by
 * scripts/build-icons.mjs into src/app/lib/nucleo-icons.ts.
 */
import { Icon, type IconName } from "../../components/Icon";

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

/** Build a named icon component bound to a Nucleo icon name. */
function make(nucleo: IconName) {
  const Comp = (p: IconProps) => <Icon name={nucleo} {...p} />;
  Comp.displayName = `Icon(${nucleo})`;
  return Comp;
}

export const NewChatIcon = make("new-chat");
export const EditIcon = make("edit");
export const PinIcon = make("pin");
export const ChevronRightIcon = make("chevron-right");
export const ChevronDownIcon = make("chevron-down");
export const CheckIcon = make("check");
export const CopyIcon = make("copy");
export const RefreshIcon = make("refresh");
export const InfoIcon = make("bell"); // fallback: info -> use bell family; overridden below if needed
export const PlusCircleIcon = make("circle-plus");
export const AttachIcon = make("attach");
export const MicIcon = make("mic");
export const ArrowUpIcon = make("arrow-up");
export const FolderIcon = make("folder");
export const ShieldIcon = make("shield");
export const SparkleIcon = make("sparkle");
export const GithubIcon = make("branch"); // repo/branch glyph
export const AddTabIcon = make("plus");
export const ExpandIcon = make("expand");
export const SidePanelIcon = make("sidebar");
export const TerminalIcon = make("terminal");
export const WrenchIcon = make("tool");
export const FileIcon = make("file");
export const GlobeIcon = make("globe");
export const DocsIcon = make("file");
export const SearchIcon = make("search");
export const BellIcon = make("bell");
export const ClockIcon = make("clock");
export const GitBranchIcon = make("branch");
export const PluginsIcon = make("plug");
export const XIcon = make("x");
export const CommandIcon = make("grid");
export const SendIcon = make("send");
export const StarIcon = make("star");
export const TargetIcon = make("target");
export const AlertIcon = make("warning");
export const HandIcon = make("hand");
export const CubeIcon = make("cube");
export const TrashIcon = make("trash");
export const ShareIcon = make("share");
export const AtIcon = make("at");
export const BulbIcon = make("bulb");
export const RecordIcon = make("record");
export const BrainIcon = make("brain");
export const RobotIcon = make("robot");
export const BookIcon = make("book");

export type { IconName };
