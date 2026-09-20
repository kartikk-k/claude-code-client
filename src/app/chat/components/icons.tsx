/**
 * Icon components for the app — backed by the Nucleo UI (Outline, 18px) set.
 * Every named export renders a hand-authored inline-<svg> glyph from
 * `../../components/icons/IconStore`, so each call site
 * (`<SearchIcon className="size-4" />`, `<CopyIcon width={14} height={14} />`)
 * keeps working unchanged. Icons inherit currentColor. Default render size
 * 16px; callers pass size/className/width. The public surface of this module
 * (these export names) is stable — only the implementation behind them changed.
 *
 * The underlying glyph components live in
 * src/app/components/icons/IconStore.tsx (literal components, no runtime map).
 */
import {
  ArrowUpGlyph,
  AtGlyph,
  AttachGlyph,
  BellGlyph,
  BookGlyph,
  BranchGlyph,
  BrainGlyph,
  BulbGlyph,
  LinkGlyph,
  CheckGlyph,
  ChevronDownGlyph,
  ChevronRightGlyph,
  CirclePlusGlyph,
  ClockGlyph,
  CompassGlyph,
  CopyGlyph,
  CubeGlyph,
  DotsGlyph,
  EditGlyph,
  ExpandGlyph,
  FileGlyph,
  FolderGlyph,
  GearGlyph,
  GlobeGlyph,
  GridGlyph,
  HandGlyph,
  InviteGlyph,
  LogoutGlyph,
  MicGlyph,
  NewChatGlyph,
  PinGlyph,
  PlugGlyph,
  PlusGlyph,
  RecordGlyph,
  RefreshGlyph,
  RobotGlyph,
  SearchGlyph,
  SendGlyph,
  ShareGlyph,
  ShieldGlyph,
  SidebarGlyph,
  SparkleGlyph,
  SparkleSingleGlyph,
  StarGlyph,
  TargetGlyph,
  TerminalGlyph,
  ToolGlyph,
  TrashGlyph,
  UsageGlyph,
  WarningGlyph,
  XGlyph,
  ReviewGlyph,
  SquareTerminalGlyph,
  FoldersGlyph,
  BulletListGlyph,
  CodePullRequestGlyph,
  CodeMergeGlyph,
  BranchMergeGlyph,
  CodeForkGlyph,
  ExpandDiagonalGlyph,
  MinimizeGlyph,
  SortGlyph,
  FolderOpenGlyph,
  PanelRightOpenGlyph,
  PanelRightClosedGlyph,
  ExpandFullGlyph,
  FilesTabGlyph,
  TerminalTabGlyph,
  SideChatTabGlyph,
  ListReorderGlyph,
  BottomPanelClosedGlyph,
  BottomPanelOpenGlyph,
  ArchiveGlyph,
  LaptopGlyph,
  ChatBubblePlusGlyph,
  FolderPointerGlyph,
} from "../../components/icons/IconStore";

/** Union of the Nucleo icon keys these components are built from. */
export type IconName =
  | "new-chat"
  | "edit"
  | "search"
  | "bell"
  | "folder"
  | "plus"
  | "circle-plus"
  | "attach"
  | "mic"
  | "arrow-up"
  | "send"
  | "chevron-down"
  | "chevron-right"
  | "copy"
  | "refresh"
  | "shield"
  | "hand"
  | "warning"
  | "trash"
  | "share"
  | "star"
  | "pin"
  | "clock"
  | "cube"
  | "plug"
  | "grid"
  | "at"
  | "branch"
  | "target"
  | "bulb"
  | "record"
  | "file"
  | "sidebar"
  | "expand"
  | "globe"
  | "check"
  | "x"
  | "terminal"
  | "brain"
  | "robot"
  | "tool"
  | "book"
  | "sparkle"
  | "link"
  | "split"
  | "activity"
  | "card"
  | "compass"
  | "usage"
  | "dots"
  | "gear"
  | "logout"
  | "invite";

export const NewChatIcon = NewChatGlyph;
export const EditIcon = EditGlyph;
export const PinIcon = PinGlyph;
export const ChevronRightIcon = ChevronRightGlyph;
export const ChevronDownIcon = ChevronDownGlyph;
export const CheckIcon = CheckGlyph;
export const CopyIcon = CopyGlyph;
export const RefreshIcon = RefreshGlyph;
export const InfoIcon = BellGlyph; // fallback: info -> bell family
export const PlusCircleIcon = CirclePlusGlyph;
export const AttachIcon = AttachGlyph;
export const MicIcon = MicGlyph;
export const ArrowUpIcon = ArrowUpGlyph;
export const FolderIcon = FolderGlyph;
export const ShieldIcon = ShieldGlyph;
export const SparkleIcon = SparkleGlyph;
export const SparkleSingleIcon = SparkleSingleGlyph;
export const GithubIcon = BranchGlyph; // repo/branch glyph
export const AddTabIcon = PlusGlyph;
export const PlusIcon = PlusGlyph;
export const ExpandIcon = ExpandGlyph;
export const SidePanelIcon = SidebarGlyph;
export const TerminalIcon = TerminalGlyph;
export const WrenchIcon = ToolGlyph;
export const FileIcon = FileGlyph;
export const GlobeIcon = GlobeGlyph;
export const DocsIcon = FileGlyph;
export const SearchIcon = SearchGlyph;
export const BellIcon = BellGlyph;
export const ClockIcon = ClockGlyph;
export const GitBranchIcon = BranchGlyph;
export const PluginsIcon = PlugGlyph;
export const XIcon = XGlyph;
export const CommandIcon = GridGlyph;
export const SendIcon = SendGlyph;
export const StarIcon = StarGlyph;
export const TargetIcon = TargetGlyph;
export const AlertIcon = WarningGlyph;
export const HandIcon = HandGlyph;
export const CubeIcon = CubeGlyph;
export const TrashIcon = TrashGlyph;
export const ShareIcon = ShareGlyph;
export const AtIcon = AtGlyph;
export const BulbIcon = BulbGlyph;
export const LinkIcon = LinkGlyph;
export const RecordIcon = RecordGlyph;
export const BrainIcon = BrainGlyph;
export const RobotIcon = RobotGlyph;
export const BookIcon = BookGlyph;
export const CompassIcon = CompassGlyph;
export const DotsIcon = DotsGlyph;
export const GaugeIcon = UsageGlyph;
export const GearIcon = GearGlyph;
export const LogoutIcon = LogoutGlyph;
export const InviteIcon = InviteGlyph;
// Right-panel tabs + header + git-status glyphs (Nucleo outline 18px).
export const ReviewIcon = ReviewGlyph;
export const SquareTerminalIcon = SquareTerminalGlyph;
export const FoldersIcon = FoldersGlyph;
export const BulletListIcon = BulletListGlyph;
export const CodePullRequestIcon = CodePullRequestGlyph;
export const CodeMergeIcon = CodeMergeGlyph;
export const BranchMergeIcon = BranchMergeGlyph;
export const CodeForkIcon = CodeForkGlyph;
export const ExpandDiagonalIcon = ExpandDiagonalGlyph;
export const MinimizeIcon = MinimizeGlyph;
export const SortIcon = SortGlyph;
export const FolderOpenIcon = FolderOpenGlyph;
export const PanelRightOpenIcon = PanelRightOpenGlyph;
export const PanelRightClosedIcon = PanelRightClosedGlyph;
export const ExpandFullIcon = ExpandFullGlyph;
export const FilesTabIcon = FilesTabGlyph;
export const TerminalTabIcon = TerminalTabGlyph;
export const SideChatTabIcon = SideChatTabGlyph;
export const ListReorderIcon = ListReorderGlyph;
export const BottomPanelClosedIcon = BottomPanelClosedGlyph;
export const BottomPanelOpenIcon = BottomPanelOpenGlyph;
export const ArchiveIcon = ArchiveGlyph;
export const LaptopIcon = LaptopGlyph;
export const ChatBubblePlusIcon = ChatBubblePlusGlyph;
export const FolderPointerIcon = FolderPointerGlyph;
