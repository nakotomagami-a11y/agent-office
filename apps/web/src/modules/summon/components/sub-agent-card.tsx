"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { useExpandedState } from "./expanded-state";
import type { ThreadItem } from "../format/thread-types";

type SubAgentItem = Extract<ThreadItem, { kind: "agent-subagent" }>;

/**
 * Rendered inline inside the chat thread when the parent agent spawns a
 * sub-agent. Shows live status while running, then collapses to a header
 * with token/cost summary and a link to the transcript.
 */
export function SubAgentCard({ item }: { item: SubAgentItem }) {
  const [open, toggle] = useExpandedState(item.id);
  const elapsed = useSubAgentElapsed(item);

  const duration = item.status === "running"
    ? `${elapsed}s`
    : item.durationMs !== undefined ? `${(item.durationMs / 1000).toFixed(1)}s` : undefined;

  const badgeClass = subAgentBadgeClass(item.status);
  const isRunning = item.status === "running" || item.status === "queued" || item.status === "cancelling";
  const liveHint = isRunning ? (item.currentTool ? `using ${item.currentTool}` : item.lastOutputLine ?? null) : null;
  const totalTok = item.tokensIn !== undefined || item.tokensOut !== undefined
    ? (item.tokensIn ?? 0) + (item.tokensOut ?? 0)
    : null;

  return (
    <div className="my-1 ml-[14px] border-l-2 border-l-[#3b7de8] px-[14px] py-[10px] bg-[linear-gradient(90deg,rgba(59,125,232,0.09)_0%,transparent_72%)] rounded-[0_10px_10px_0]">
      <SubAgentHeader item={item} open={open} toggle={toggle} badgeClass={badgeClass} liveHint={liveHint} duration={duration} />
      {open ? <SubAgentBody item={item} totalTok={totalTok} /> : null}
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

function subAgentBadgeClass(status: SubAgentItem["status"]): string {
  const base = "text-[10px] font-medium px-[7px] py-[1px] rounded-full border border-transparent";
  if (status === "done") return `${base} ok`;
  if (status === "error") return `${base} err`;
  return `${base} running`;
}

function SubAgentHeader({ item, open, toggle, badgeClass, liveHint, duration }: {
  item: SubAgentItem;
  open: boolean;
  toggle: () => void;
  badgeClass: string;
  liveHint: string | null;
  duration: string | undefined;
}) {
  return (
    <div className="flex items-center gap-[10px] cursor-pointer select-none" onClick={toggle} role="button" aria-expanded={open}>
      <div className="w-6 h-6 rounded-full bg-[linear-gradient(135deg,#3b7de8_0%,#1e56c0_100%)] flex items-center justify-center text-white shrink-0" aria-hidden>
        <Icon name="bot-ao" size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#74a8f0] mb-[2px]">spawned sub-agent</div>
        <div className="text-[13px] font-semibold text-ao-fg-0 flex items-center gap-[7px]">
          {item.name}
          <span className={badgeClass}>{item.status}</span>
        </div>
        {liveHint ? (
          <div className="font-mono text-[10.5px] text-ao-fg-3 mt-[3px] truncate max-w-[420px]">{liveHint}</div>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2 text-ao-fg-3 font-mono text-[11px] shrink-0">
        {duration ? <span>{duration}</span> : null}
        <Icon name="chevron" size={13} className={cn("transition-transform duration-[180ms]", open && "rotate-90")} />
      </div>
    </div>
  );
}

function SubAgentBody({ item, totalTok }: { item: SubAgentItem; totalTok: number | null }) {
  return (
    <div className="mt-[10px] flex flex-col gap-[8px]">
      <div className="px-3 py-[10px] bg-[var(--ao-bg-1)] border border-ao-line-1 rounded-[6px] font-mono text-[11.5px] text-ao-fg-1 leading-[1.55] whitespace-pre-wrap break-words">
        {item.prompt}
      </div>
      {(totalTok !== null || item.cost !== undefined || item.subRunId) ? (
        <div className="flex items-center gap-[10px] font-mono text-[11px] text-ao-fg-3">
          {totalTok !== null ? <span>{totalTok.toLocaleString()} tok</span> : null}
          {item.cost !== undefined && item.cost > 0 ? <span>${item.cost.toFixed(4)}</span> : null}
          {item.subRunId ? (
            <Link
              href={PAGE_ROUTES.run(item.subRunId)}
              className="ml-auto inline-flex items-center gap-[4px] text-[var(--ao-accent)] no-underline hover:underline text-[11px]"
              onClick={(e) => e.stopPropagation()}
            >
              View transcript
              <Icon name="chevron" size={10} className="rotate-[-90deg]" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
