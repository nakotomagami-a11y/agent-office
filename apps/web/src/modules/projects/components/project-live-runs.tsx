"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { useSummon } from "@/modules/summon/hooks/use-summon";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { formatCost, formatDuration } from "@/modules/runs/format/format-run-meta";
import { runningRuns, runsAwaitingReply } from "../format/run-stats";
import { UnitSprite } from "@/components/ui/unit-sprite";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { Icon } from "@/components/ui/icon";
import { LiveSweep } from "@/components/ui/live-sweep";
import { ToolIcon } from "@/modules/summon/components/tool-group-row";
import { ApiError } from "@/lib/api-client";
import type { AgentInstance, PersistedRun } from "@agent-office/domain/types";

// "First 2, load more for the rest" per the dashboard's own scope — this is
// a glance-at-it-in-passing panel, not the place to browse every run.
const VISIBLE_CAP = 2;

export type ProjectLiveRunsProps = {
  projectId: string;
  /** Project roster — used only to label reply cards by session (see
   *  `sessionLabelFor`). Passed in by the caller, not re-fetched. */
  roster: AgentInstance[];
  /** Opens the real "add agent to roster" flow — reused as the empty-state CTA. */
  onSummonAnother: () => void;
};

/**
 * Session label for disambiguating "Reply to {agent}" when an agent has
 * multiple instances. `null` when there's only one (nothing to disambiguate).
 * Mirrors the sidebar's 1-indexed "Session N" numbering. For an instance no
 * longer in the roster (removed since the run), falls back to a short id
 * suffix rather than `run.instanceLabel` — that field defaults to the agent
 * name, i.e. the useless duplicate this exists to avoid.
 */
function sessionLabelFor(roster: AgentInstance[], run: PersistedRun, t: (key: string, values?: Record<string, string | number>) => string): string | null {
  const siblings = roster.filter((i) => i.agentId === run.agentId);
  if (siblings.length <= 1) return null;
  const idx = siblings.findIndex((i) => i.instanceId === run.instanceId);
  const inst = idx === -1 ? undefined : siblings[idx];
  if (!inst) return run.instanceId ? `#${run.instanceId.slice(-6)}` : null;
  return inst.label || t("sidebar.session_default_label", { number: idx + 1 });
}

/**
 * Dashboard panel for the project's running agents. Two distinct signals:
 *  - "Live" rows: subprocess still running — shows the current activity. A
 *    live process is never waiting on the user (this harness exits to ask).
 *  - "Awaiting reply" cards: last run finished on what reads like a question
 *    (`runsAwaitingReply`) — these get the inline reply composer.
 */
export function ProjectLiveRuns({ projectId, roster, onSummonAnother }: ProjectLiveRunsProps) {
  const t = useTranslations();
  const runsQ = useRuns({ projectId, limit: 100 });
  const [expanded, setExpanded] = useState(false);
  // Client-side "not now" dismissal, keyed by run id — a new turn gets a new
  // id, so a real reply or fresh question re-shows the card.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const runs = useMemo(() => runsQ.data ?? [], [runsQ.data]);
  const live = runningRuns(runs);
  const awaiting = useMemo(
    () => runsAwaitingReply(runs, roster).filter((r) => !dismissedIds.has(r.id)),
    [runs, roster, dismissedIds],
  );
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
                <ReplyComposer
                  key={run.id}
                  projectId={projectId}
                  target={run}
                  sessionLabel={sessionLabelFor(roster, run, t)}
                  onDismiss={() => setDismissedIds((prev) => new Set(prev).add(run.id))}
                />
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

/** Current live activity: the tool in flight (`run.currentTool`), or
 *  "Thinking…" between tool calls. Never the static original prompt. */
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
  const select = useOfficeStore((s) => s.select);
  return (
    <button
      type="button"
      onClick={() => select(run.agentId, { instanceId: run.instanceId ?? null, tab: "conversation" })}
      title={run.prompt}
      className="relative w-full overflow-hidden px-[13px] py-[11px] rounded-[14px] bg-card-2 border border-edge shadow-[var(--inset-hi)] text-left cursor-pointer transition-colors duration-150 hover:border-txt-4"
    >
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
    </button>
  );
}

/** Posts straight into `target`'s session via the real summon API — the round-trip this feature exists to test. */
function ReplyComposer({ projectId, target, sessionLabel, onDismiss }: {
  projectId: string;
  target: PersistedRun;
  /** Which instance this is, when the agent has more than one — see
   *  `sessionLabelFor`. `null` when there's nothing to disambiguate. */
  sessionLabel: string | null;
  onDismiss: () => void;
}) {
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
    <div className="relative overflow-hidden px-[14px] py-[12px] rounded-[14px] bg-amber-soft">
      <LiveSweep />
      <div className="flex items-center gap-[8px]">
        <span className="w-[5px] h-[5px] rounded-full bg-amber shrink-0" />
        <span className="text-[10.5px] font-bold tracking-[0.06em] uppercase text-amber whitespace-nowrap">
          Reply to {target.agentName}
        </span>
        {sessionLabel && (
          <span className="text-[10.5px] font-semibold text-amber/70 whitespace-nowrap truncate">
            · {sessionLabel}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Not now"
          title="Not now — dismiss this reply prompt"
          className="shrink-0 w-[20px] h-[20px] flex items-center justify-center rounded-[6px] text-amber/70 hover:bg-black/10 hover:text-amber transition-colors duration-150"
        >
          <Icon name="x" size={11} />
        </button>
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
