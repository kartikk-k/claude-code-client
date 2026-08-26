"use client";

import type { SubAgent, ContentBlock } from "../lib/types";
import { SidePanelIcon, ChevronRightIcon } from "../chat/components/icons";
import { MessageList } from "./MessageList";

/**
 * Returns the first user-authored prompt text of a sub-agent, flattened to a
 * single string. Empty string when the agent has no user text yet.
 */
export function firstUserText(agent: SubAgent): string {
  for (const msg of agent.messages) {
    if (msg.role !== "user") continue;
    const text = msg.content
      .map((block: ContentBlock) =>
        block.type === "text" && typeof block.text === "string" ? block.text : "",
      )
      .join("")
      .trim();
    if (text) return text;
  }
  return "";
}

function shortId(agentId: string): string {
  return agentId.length > 8 ? agentId.slice(0, 8) : agentId;
}

type AgentsPanelProps = {
  agents: SubAgent[];
  activeAgentId?: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
};

export function AgentsPanel({
  agents,
  activeAgentId,
  onSelect,
  collapsed,
  onToggle,
}: AgentsPanelProps) {
  if (collapsed) {
    return (
      <aside className="flex h-full w-11 min-w-11 shrink-0 flex-col items-center border-l border-panel-border">
        <div className="flex h-11 shrink-0 items-center justify-center">
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sub-agents panel"
            className="flex size-6 items-center justify-center rounded-[8.4px] border-[0.556px] border-transparent text-text-secondary transition-colors hover:bg-bubble-bg hover:text-text-strong"
          >
            <SidePanelIcon width={16} height={16} />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <span
            className="text-[12.8px] font-medium leading-4 text-text-secondary"
            style={{ writingMode: "vertical-rl" }}
          >
            Sub-agents ({agents.length})
          </span>
        </div>
      </aside>
    );
  }

  const activeAgent =
    activeAgentId != null
      ? agents.find((a) => a.agentId === activeAgentId)
      : undefined;

  return (
    <aside className="flex h-full w-[420px] min-w-[320px] shrink-0 flex-col overflow-hidden border-l border-panel-border">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center gap-2 px-3">
        {activeAgent ? (
          <button
            type="button"
            onClick={() => onSelect("")}
            aria-label="Back to sub-agents list"
            className="flex h-6 items-center gap-1 rounded-[8.4px] px-1 text-text-secondary transition-colors hover:text-text-strong"
          >
            <span className="rotate-180">
              <ChevronRightIcon width={16} height={16} />
            </span>
            <span className="text-[12.8px] font-medium leading-[18.286px]">
              Back
            </span>
          </button>
        ) : (
          <>
            <span className="text-[13.3px] font-semibold leading-5 text-text-strong">
              Sub-agents
            </span>
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-bubble-bg px-1 text-[11px] font-medium leading-none text-text-secondary">
              {agents.length}
            </span>
          </>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse sub-agents panel"
          className="ml-auto flex size-6 items-center justify-center rounded-[8.4px] border-[0.556px] border-transparent text-text-secondary transition-colors hover:bg-bubble-bg hover:text-text-strong"
        >
          <SidePanelIcon width={16} height={16} />
        </button>
      </div>

      {/* Body */}
      {activeAgent ? (
        <div className="flex-1 overflow-y-auto">
          <MessageList messages={activeAgent.messages} />
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <p className="text-center text-sm leading-5 text-text-secondary">
            No sub-agents in this session.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
          {agents.map((agent) => {
            const prompt = firstUserText(agent);
            const isActive = agent.agentId === activeAgentId;
            return (
              <button
                key={agent.agentId}
                type="button"
                onClick={() => onSelect(agent.agentId)}
                className={`flex w-full flex-col gap-2 rounded-[16.8px] border bg-bubble-bg p-3 text-left transition-colors hover:border-panel-border ${
                  isActive
                    ? "border-transparent ring-1 ring-[var(--agent-accent)]"
                    : "border-card-border"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: "var(--agent-accent)" }}
                  />
                  <span className="font-mono text-xs leading-4 text-text-secondary">
                    {shortId(agent.agentId)}
                  </span>
                  <span className="ml-auto text-[11px] leading-4 text-text-faint">
                    {agent.messages.length}{" "}
                    {agent.messages.length === 1 ? "message" : "messages"}
                  </span>
                </div>
                <p className="line-clamp-2 text-[13px] leading-5 text-text-primary">
                  {prompt || (
                    <span className="text-text-faint">No prompt yet.</span>
                  )}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
