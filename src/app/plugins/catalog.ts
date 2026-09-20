/**
 * Plugin (MCP server) catalog. A plugin here is a Model Context Protocol server
 * that Claude Code can connect to for extra tools. This is seed data for the
 * UI — a handful of well-known MCP servers — with enough shape to render both
 * the marketplace list and a per-plugin detail page. No install logic is wired
 * yet; `installed` is just the initial state.
 */

export type PluginTool = {
  name: string;
  description: string;
};

export type Plugin = {
  id: string;
  name: string;
  /** One-line tagline for cards. */
  tagline: string;
  /** Longer description shown on the detail page. */
  description: string;
  category: string;
  /** Brand/accent color used for the tile background (fallback letter mark). */
  color: string;
  /** Short mark shown in the tile when no brand `logo` is set. */
  mark: string;
  /**
   * Path (under /public) to the brand logo SVG downloaded from svgl.app. When
   * set, the tile renders this instead of the letter `mark`.
   */
  logo?: string;
  /**
   * Tile background behind the `logo`. "light" = near-white chip (for dark or
   * multicolor marks), "dark" = the brand `color` (for white marks). Ignored
   * when no `logo` is set (the letter mark always uses the brand gradient).
   */
  logoBg?: "light" | "dark";
  installed: boolean;
  featured?: boolean;
  /** MCP transport hint shown in the info table. */
  transport: "stdio" | "http" | "sse";
  /** Install command / config snippet for the detail page. */
  command: string;
  /** Example prompts surfaced on the detail hero. */
  examples: string[];
  /** Tools this server exposes. */
  tools: PluginTool[];
  developer: string;
  version: string;
  website?: string;
};

export const PLUGINS: Plugin[] = [
  {
    id: "github",
    name: "GitHub",
    tagline: "Triage PRs, issues, CI, and publish flows",
    description:
      "Inspect repositories, review pull requests, address feedback, debug failing Actions, and prepare changes for review — through a connector-first workflow with targeted CLI fallbacks.",
    category: "Developer Tools",
    color: "#1f2328",
    mark: "GH",
    logo: "/plugins/github.svg",
    logoBg: "dark",
    installed: true,
    featured: true,
    transport: "http",
    command: "claude mcp add github --transport http https://api.githubcopilot.com/mcp",
    examples: [
      "Explain this repo's authentication: components, request flow, and how tokens are handled",
      "Summarize this pull request like a senior reviewer: what changed and what could break",
      "Turn the last 7 days of commits and merged PRs into a stakeholder update",
    ],
    tools: [
      { name: "list_pull_requests", description: "List and filter pull requests" },
      { name: "get_pull_request", description: "Read a PR's diff and metadata" },
      { name: "create_issue", description: "Open a new issue" },
      { name: "search_code", description: "Search code across repositories" },
    ],
    developer: "GitHub",
    version: "0.1.12",
    website: "https://github.com",
  },
  {
    id: "filesystem",
    name: "Filesystem",
    tagline: "Read and write files in allowed directories",
    description:
      "Secure, scoped access to the local filesystem — read, write, move, and search files within directories you explicitly allow.",
    category: "System",
    color: "#3b7dd8",
    mark: "FS",
    installed: true,
    transport: "stdio",
    command: "claude mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem ~/Projects",
    examples: [
      "Find every TODO comment under src/ and group them by file",
      "Rename all .jsx files in this folder to .tsx",
      "Summarize what changed across these three config files",
    ],
    tools: [
      { name: "read_file", description: "Read a file's contents" },
      { name: "write_file", description: "Create or overwrite a file" },
      { name: "list_directory", description: "List entries in a directory" },
      { name: "search_files", description: "Search files by name pattern" },
    ],
    developer: "Anthropic",
    version: "0.6.2",
    website: "https://modelcontextprotocol.io",
  },
  {
    id: "postgres",
    name: "Postgres",
    tagline: "Query and inspect Postgres databases",
    description:
      "Connect to a Postgres instance to run read-only queries, inspect schemas, and explain query plans — ideal for exploring data during a task.",
    category: "Data",
    color: "#31648c",
    mark: "PG",
    logo: "/plugins/postgres.svg",
    logoBg: "light",
    installed: false,
    featured: true,
    transport: "stdio",
    command: "claude mcp add postgres -- npx -y @modelcontextprotocol/server-postgres $DATABASE_URL",
    examples: [
      "Show the schema for the orders table and its foreign keys",
      "How many users signed up per week over the last quarter?",
      "Explain why this query is slow and suggest an index",
    ],
    tools: [
      { name: "query", description: "Run a read-only SQL query" },
      { name: "list_schemas", description: "List database schemas" },
      { name: "describe_table", description: "Inspect a table's columns" },
    ],
    developer: "Anthropic",
    version: "0.6.2",
    website: "https://modelcontextprotocol.io",
  },
  {
    id: "linear",
    name: "Linear",
    tagline: "Manage issues, projects, and cycles",
    description:
      "Create and update Linear issues, move them across states, and pull project context straight into a session.",
    category: "Productivity",
    color: "#5e6ad2",
    mark: "LN",
    logo: "/plugins/linear.svg",
    logoBg: "light",
    installed: false,
    featured: true,
    transport: "sse",
    command: "claude mcp add linear --transport sse https://mcp.linear.app/sse",
    examples: [
      "Create a bug for the crash I just described and add it to the current cycle",
      "What issues are assigned to me and due this week?",
      "Summarize the Mobile project's progress for standup",
    ],
    tools: [
      { name: "create_issue", description: "Create a Linear issue" },
      { name: "update_issue", description: "Update status, assignee, or labels" },
      { name: "list_issues", description: "Query issues with filters" },
    ],
    developer: "Linear",
    version: "1.2.0",
    website: "https://linear.app",
  },
  {
    id: "slack",
    name: "Slack",
    tagline: "Read channels and post messages",
    description:
      "Read recent messages, search conversations, and post updates to Slack channels without leaving a session.",
    category: "Communication",
    color: "#4a154b",
    mark: "SL",
    logo: "/plugins/slack.svg",
    logoBg: "light",
    installed: false,
    transport: "http",
    command: "claude mcp add slack --transport http https://slack.com/api/mcp",
    examples: [
      "Post a summary of what I shipped today to #engineering",
      "What did the team discuss in #incidents this morning?",
      "Draft a reply to the last message in #support",
    ],
    tools: [
      { name: "post_message", description: "Send a message to a channel" },
      { name: "list_channels", description: "List accessible channels" },
      { name: "search_messages", description: "Search message history" },
    ],
    developer: "Slack",
    version: "0.9.0",
    website: "https://slack.com",
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    tagline: "Drive a headless browser",
    description:
      "Automate a headless Chromium — navigate pages, click, fill forms, and capture screenshots for verification and scraping.",
    category: "Developer Tools",
    color: "#2b7a5b",
    mark: "PP",
    installed: false,
    transport: "stdio",
    command: "claude mcp add puppeteer -- npx -y @modelcontextprotocol/server-puppeteer",
    examples: [
      "Open the staging site, log in, and screenshot the dashboard",
      "Fill out this form and confirm the success toast appears",
      "Scrape the pricing table from this page into JSON",
    ],
    tools: [
      { name: "navigate", description: "Go to a URL" },
      { name: "click", description: "Click an element" },
      { name: "screenshot", description: "Capture a screenshot" },
      { name: "fill", description: "Type into an input" },
    ],
    developer: "Anthropic",
    version: "0.6.2",
    website: "https://pptr.dev",
  },
  {
    id: "sentry",
    name: "Sentry",
    tagline: "Investigate errors and performance issues",
    description:
      "Pull Sentry issues into a session, read stack traces, and correlate errors with recent releases.",
    category: "Monitoring",
    color: "#6a1b9a",
    mark: "SN",
    logo: "/plugins/sentry.svg",
    logoBg: "light",
    installed: false,
    transport: "http",
    command: "claude mcp add sentry --transport http https://mcp.sentry.dev/mcp",
    examples: [
      "What are the top unresolved errors in the web project this week?",
      "Show the stack trace for the latest crash and point at the likely cause",
      "Which release introduced this spike in errors?",
    ],
    tools: [
      { name: "list_issues", description: "List Sentry issues" },
      { name: "get_issue", description: "Read an issue's details and events" },
    ],
    developer: "Sentry",
    version: "0.4.0",
    website: "https://sentry.io",
  },
  {
    id: "notion",
    name: "Notion",
    tagline: "Read and write pages and databases",
    description:
      "Search Notion, read pages and databases, and create or update content — bring your docs and workflows into a session.",
    category: "Productivity",
    color: "#111111",
    mark: "NO",
    logo: "/plugins/notion.svg",
    logoBg: "dark",
    installed: false,
    transport: "sse",
    command: "claude mcp add notion --transport sse https://mcp.notion.com/sse",
    examples: [
      "Create a spec page from the notes we just wrote",
      "Find the PRD for the billing project and summarize open questions",
      "Add a row to the Bugs database for the issue I described",
    ],
    tools: [
      { name: "search", description: "Search pages and databases" },
      { name: "get_page", description: "Read a page's content" },
      { name: "create_page", description: "Create a new page" },
    ],
    developer: "Notion",
    version: "1.0.3",
    website: "https://notion.so",
  },
];

export function getPlugin(id: string): Plugin | undefined {
  return PLUGINS.find((p) => p.id === id);
}

export const CATEGORIES = Array.from(
  new Set(PLUGINS.map((p) => p.category))
).sort();
