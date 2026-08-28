"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { useOfficeAgents } from "@/modules/office/hooks/use-office-agents";
import { StatusBadge } from "@/modules/runs/components/status-badge";
import { useExpandedState } from "./expanded-state";
import type { ThreadItem } from "../format/thread-types";

type SubAgentItem = Extract<ThreadItem, { kind: "agent-subagent" }>;

/**
 * Rendered inline inside the chat thread when the parent agent spawns a
 * sub-agent. Shows live status while running, then collapses to a header
 * with token/cost summary. Matches the same avatar-column + card layout as
 * every other row in the thread (`ToolGroupRow`, `ThinkingRow`, message
 * bubbles) instead of the old full-width blue strip, and reuses the shared
 * `StatusBadge` for status instead of dead `.ok`/`.err`/`.running` classes
 * that were never actually styled anywhere.
 */
export function SubAgentCard({ item }: { item: SubAgentItem }) {
  const [open, toggle] = useExpandedState(item.id);
  const elapsed = useSubAgentElapsed(item);
  const { agents } = useOfficeAgents();

  const duration = item.status === "running"
    ? `${elapsed}s`
    : item.durationMs !== undefined ? `${(item.durationMs / 1000).toFixed(1)}s` : undefined;

  const isRunning = item.status === "running" || item.status === "queued" || item.status === "cancelling";
  const liveHint = isRunning ? (item.currentTool ? `using ${item.currentTool}` : item.lastOutputLine ?? null) : null;
  const totalTok = item.tokensIn !== undefined || item.tokensOut !== undefined
    ? (item.tokensIn ?? 0) + (item.tokensOut ?? 0)
    : null;

  // `item.name` is the spawned agent's real id (see parse-sse-event.ts), so
  // the avatar shown here is the actual spawned agent, not a generic icon.
  const spawnedAgent = agents.find((a) => a.id === item.name);
  const unit = spawnedAgent?.unitChoice ?? unitForAgent(item.name, null);

  return (
    <div className="flex items-start gap-[12px] relative group/msg">
      <AgentAvatar unit={unit} size={60} label={item.name} className="shrink-0" />
      <div className="flex-1 min-w-0 w-full">
        <div className={cn("border border-cyan/25 bg-cyan/[0.05] rounded-[10px] overflow-hidden", open && "ao-open")}>
          <SubAgentHeader item={item} open={open} toggle={toggle} liveHint={liveHint} duration={duration} />
          {open ? <SubAgentBody item={item} totalTok={totalTok} /> : null}
        </div>
      </div>
    </div>
  );
}

function useSubAgentElapsed(item: SubAgentItem): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (item.status !== "running") return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - item.startTs) / 1000)), 1000);
    return () => clearInterval(id);
  }, [item.status, item.startTs]);
  return elapsed;
}

function SubAgentHeader({ item, open, toggle, liveHint, duration }: {
  item: SubAgentItem;
  open: boolean;
  toggle: () => void;
  liveHint: string | null;
  duration: string | undefined;
}) {
  return (
    <div
      className="flex items-center gap-[10px] px-[14px] py-[10px] cursor-pointer select-none transition-[background] duration-[120ms] hover:bg-cyan/[0.08]"
      onClick={toggle}
      role="button"
      aria-expanded={open}
    >
      <span className="w-[26px] h-[26px] rounded-[7px] bg-cyan/15 border border-cyan/25 text-cyan flex items-center justify-center shrink-0">
        <Icon name="bot-ao" size={13} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] tracking-[0.08em] uppercase text-cyan mb-[2px]">spawned sub-agent</div>
        <div className="text-[13px] font-semibold text-ao-fg-0 flex items-center gap-[7px]">
          {item.name}
          <StatusBadge status={item.status} />
        </div>
        {liveHint ? (
          <div className="font-mono text-[10.5px] text-ao-fg-3 mt-[3px] truncate max-w-[420px]">{liveHint}</div>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2 text-ao-fg-3 font-mono text-[11px] shrink-0">
        {duration ? <span>{duration}</span> : null}
        <Icon name="chevron" size={13} className={cn("transition-transform duration-[180ms]", open && "rotate-90 text-cyan")} />
      </div>
    </div>
  );
}

function SubAgentBody({ item, totalTok }: { item: SubAgentItem; totalTok: number | null }) {
  return (
    <div className="border-t border-cyan/15 p-[14px] flex flex-col gap-[10px]">
      <div className="px-3 py-[10px] bg-[var(--ao-bg-1)] border border-ao-line-1 rounded-[6px] font-mono text-[11.5px] text-ao-fg-1 leading-[1.55] whitespace-pre-wrap break-words">
        {item.prompt}
      </div>
      {(totalTok !== null || item.cost !== undefined) ? (
        <div className="flex items-center gap-[10px] font-mono text-[11px] text-ao-fg-3">
          {totalTok !== null ? <span>{totalTok.toLocaleString()} tok</span> : null}
          {item.cost !== undefined && item.cost > 0 ? <span>${item.cost.toFixed(4)}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
