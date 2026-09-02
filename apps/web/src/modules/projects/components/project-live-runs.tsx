"use client";

import { useState } from "react";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { useSummon } from "@/modules/summon/hooks/use-summon";
import { formatCost, formatDuration } from "@/modules/runs/format/format-run-meta";
import { runningRuns, runsAwaitingReply } from "../format/run-stats";
import { UnitSprite } from "@/components/ui/unit-sprite";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { Icon } from "@/components/ui/icon";
import { ToolIcon } from "@/modules/summon/components/tool-group-row";
import { ApiError } from "@/lib/api-client";
import type { PersistedRun } from "@agent-office/domain/types";

// "First 2, load more for the rest" per the dashboard's own scope — this is
// a glance-at-it-in-passing panel, not the place to browse every run.
const VISIBLE_CAP = 2;

export type ProjectLiveRunsProps = {
  projectId: string;
  /** Opens the real "add agent to roster" flow — reused as the empty-state CTA. */
  onSummonAnother: () => void;
};

/**
 * Dashboard panel for the project's currently-running agents. Two
 * independent signals, never conflated:
 *
 *  - "Live" rows: agents whose subprocess is still running right now — shown
 *    with their current activity (the tool call in flight, or "Thinking…"),
 *    because a live process is by construction NOT waiting on the user (this
 *    CLI harness always exits the subprocess when it wants a reply instead
 *    of pausing mid-run).
 *  - "Awaiting reply" cards: agents whose most recent run already finished
 *    and ended on what reads like a question — these are the ones that
 *    actually need the inline reply composer, and they're computed from the
 *    conversation's real end state (`runsAwaitingReply`), not just "whichever
 *    running run happened to be first".
 */
export function ProjectLiveRuns({ projectId, onSummonAnother }: ProjectLiveRunsProps) {
  const runsQ = useRuns({ projectId, limit: 100 });
  const [expanded, setExpanded] = useState(false);

  const runs = runsQ.data ?? [];
  const live = runningRuns(runs);
  const awaiting = runsAwaitingReply(runs);
  const shown = expanded ? live : live.slice(0, VISIBLE_CAP);
  const totals = live.reduce(
    (acc, r) => ({ tokens: acc.tokens + r.tokensIn + r.tokensOut, cost: acc.cost + r.cost }),
    { tokens: 0, cost: 0 },
  );
  const isEmpty = live.length === 0 && awaiting.length === 0;

  return (
    <div className="flex-1 min-w-[320px] rounded-[24px] surface-sheen shadow-[var(--lift)] px-[20px] py-[18px] flex flex-col">
      <div className="flex items-center gap-[10px]">
        <span className="text-[15px] font-bold whitespace-nowrap">Live runs</span>
        {live.length > 0 && (
          <span className="flex items-center gap-[6px] px-[9px] py-[3px] rounded-full bg-green-soft text-green text-[10.5px] font-bold whitespace-nowrap shrink-0">
            <span className="w-[5px] h-[5px] rounded-full bg-green animate-pulse" />
            {live.length} ACTIVE
          </span>
        )}
        <span className="flex-1" />
        {live.length > VISIBLE_CAP && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[12.5px] font-semibold text-acc cursor-pointer bg-transparent border-none whitespace-nowrap"
          >
            {expanded ? "Show less" : `Load more (${live.length - VISIBLE_CAP})`}
          </button>
        )}
      </div>

      {isEmpty ? (
        <EmptyState onSummonAnother={onSummonAnother} />
      ) : (
        <>
          {awaiting.length > 0 && (
            <div className="flex flex-col gap-[9px] mt-[14px]">
              {awaiting.map((run) => (
                <ReplyComposer key={run.id} projectId={projectId} target={run} />
              ))}
            </div>
          )}
          {live.length > 0 && (
            <div className="flex flex-col gap-[9px] mt-[14px]">
              {shown.map((run) => (
                <LiveRunRow key={run.id} run={run} />
              ))}
            </div>
          )}
          <div className="flex items-baseline gap-[16px] mt-[14px] pt-[13px] border-t border-edge">
            <span className="text-[11px] text-txt-4 whitespace-nowrap">{totals.tokens.toLocaleString()} tok</span>
            <span className="text-[11px] text-txt-4 whitespace-nowrap">{formatCost(totals.cost)} combined</span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={onSummonAnother}
              className="flex items-center gap-[7px] px-[14px] py-[8px] rounded-[11px] border border-edge-2 bg-card text-txt-2 text-[12px] font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150 hover:text-txt hover:border-txt-4"
            >
              <Icon name="plus" size={13} /> Summon another
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({ onSummonAnother }: { onSummonAnother: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-[10px] py-[28px] text-center">
      <p className="m-0 text-[13px] text-txt-3">No agents running right now.</p>
      <button
        type="button"
        onClick={onSummonAnother}
        className="flex items-center gap-[7px] px-[14px] py-[8px] rounded-[11px] bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[12.5px] font-bold cursor-pointer whitespace-nowrap shadow-[0_12px_26px_-12px_rgba(139,123,255,0.8)] transition-transform duration-150 hover:-translate-y-[1px]"
      >
        <Icon name="plus" size={13} /> Summon agent
      </button>
    </div>
  );
}

/**
 * What the agent is doing at this exact moment: the tool call currently in
 * flight (`run.currentTool` — "Bash", "Grep", "Read", …), or "Thinking…"
 * while it's between tool calls / composing text. Never the original prompt
 * — that's static from the moment the run started and tells you nothing
 * about whether it's stuck, mid-Bash, or about to finish.
 */
function LiveActivity({ tool }: { tool: string | undefined }) {
  return (
    <div className="flex items-center gap-[6px] mt-[2px] min-w-0" title={tool ? `Running ${tool}` : "Thinking"}>
      <span className="relative shrink-0 flex items-center justify-center w-[14px] h-[14px] rounded-[4px] bg-card-3 text-txt-3">
        {tool ? <ToolIcon name={tool} size={9.5} /> : <Icon name="activity" size={9.5} />}
      </span>
      <span className="font-mono text-[11px] text-txt-3 truncate">{tool ?? "Thinking…"}</span>
      <span className="w-[4px] h-[4px] rounded-full bg-green shrink-0 animate-pulse" aria-hidden />
    </div>
  );
}

function LiveRunRow({ run }: { run: PersistedRun }) {
  const unit = unitForAgent(run.agentId);
  return (
    <div className="relative overflow-hidden px-[13px] py-[11px] rounded-[14px] bg-card-2 border border-edge shadow-[var(--inset-hi)]" title={run.prompt}>
      <div className="flex items-center gap-[11px]">
        <span className="relative shrink-0 rounded-[10px] overflow-hidden bg-card-3 border border-edge-2">
          <UnitSprite unit={unit} size={32} action="working" />
          <span className="absolute -bottom-[2px] -right-[2px] w-[8px] h-[8px] rounded-full border-2 border-card-2 bg-green" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[7px]">
            <span className="text-[13px] font-bold whitespace-nowrap">{run.agentName}</span>
            <span className="text-[10px] font-semibold px-[6px] py-[1px] rounded-[5px] bg-acc-soft text-acc whitespace-nowrap">{run.model}</span>
          </div>
          <LiveActivity tool={run.currentTool} />
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-[11.5px] text-txt-2 whitespace-nowrap">{formatDuration(Date.now() - run.ts)}</div>
          <div className="font-mono text-[10px] text-txt-4 mt-[2px] whitespace-nowrap">{formatCost(run.cost)}</div>
        </div>
      </div>
    </div>
  );
}

/** Posts straight into `target`'s session via the real summon API — the round-trip this feature exists to test. */
function ReplyComposer({ projectId, target }: { projectId: string; target: PersistedRun }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const summon = useSummon();

  const send = () => {
    const prompt = text.trim();
    if (!prompt || summon.isPending) return;
    setError(null);
    summon.mutate(
      {
        agentId: target.agentId,
        prompt,
        projectId,
        instanceId: target.instanceId,
        resumeSessionId: target.sessionId,
      },
      {
        onSuccess: () => setText(""),
        onError: (err) => {
          const detail = err instanceof ApiError && typeof err.data?.detail === "string" ? err.data.detail : err.message;
          setError(detail || "Couldn't send that reply.");
        },
      },
    );
  };

  return (
    <div className="px-[14px] py-[12px] rounded-[14px] bg-amber-soft border border-edge">
      <div className="flex items-center gap-[8px]">
        <span className="w-[5px] h-[5px] rounded-full bg-amber shrink-0" />
        <span className="text-[10.5px] font-bold tracking-[0.06em] uppercase text-amber whitespace-nowrap">
          Reply to {target.agentName}
        </span>
      </div>
      <div className="flex items-center gap-[8px] mt-[9px]">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Type your reply…"
          disabled={summon.isPending}
          className="flex-1 min-w-0 px-[11px] py-[8px] rounded-[10px] bg-card border border-edge text-[12px] text-txt outline-none placeholder:text-txt-4 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || summon.isPending}
          className="px-[14px] py-[8px] rounded-[10px] bg-amber text-[#1a1204] text-[12px] font-bold cursor-pointer whitespace-nowrap shrink-0 transition-[filter] duration-150 hover:brightness-[1.08] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {summon.isPending ? "Sending…" : "Send"}
        </button>
      </div>
      {error && <p className="m-0 mt-[7px] text-[11px] text-red">{error}</p>}
    </div>
  );
}
