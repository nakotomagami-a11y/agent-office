"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { useSummon } from "@/modules/summon/hooks/use-summon";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import { formatRunCost } from "@/modules/providers/format/run-cost";
import { useCostWords } from "@/modules/providers/hooks/use-cost-words";
import { formatDuration, formatMoney } from "@/components/layout/quick-view-format";
import { questionOf, runningRuns, runsAwaitingReply } from "../format/run-stats";
import { relativeTime } from "../format/format";
import { LiveRunsEmpty } from "./project-live-runs-empty";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { Icon } from "@/components/ui/icon";
import { ToolIcon } from "@/modules/summon/components/tool-group-row";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { agentDisplayName, formatAgentDisplayName } from "@/lib/agent-display-name";
import type { AgentInstance, PersistedRun } from "@agent-office/domain/types";

// "First 2, load more for the rest" per the dashboard's own scope — this is
// a glance-at-it-in-passing panel, not the place to browse every run.
const VISIBLE_CAP = 2;
const CREW_CAP = 3;

const LIVE_SHEEN = "linear-gradient(90deg,transparent,rgba(139,123,255,.07) 45%,rgba(196,186,255,.10) 50%,rgba(139,123,255,.07) 55%,transparent)";
const REPLY_SHEEN = "linear-gradient(90deg,transparent,rgba(251,191,36,.09) 45%,rgba(255,236,180,.12) 50%,rgba(251,191,36,.09) 55%,transparent)";
const IN = "animate-[lrIn_420ms_cubic-bezier(.2,.8,.2,1)_both]";

export type ProjectLiveRunsProps = {
  projectId: string;
  /** Project roster — used only to label reply cards by session (see
   *  `sessionLabelFor`). Passed in by the caller, not re-fetched. */
  roster: AgentInstance[];
  /** Resolves display names and portraits for run rows. */
  agents: OfficeAgent[];
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
  return inst.label || inst.sessionName || t("sidebar.session_default_label", { number: idx + 1 });
}

/**
 * Dashboard panel for the project's running agents. Two distinct signals:
 *  - "Live" rows: subprocess still running — shows the current activity. A
 *    live process is never waiting on the user (this harness exits to ask).
 *  - "Awaiting reply" cards: last run finished on what reads like a question
 *    (`runsAwaitingReply`) — these get the inline reply composer, one open at a time.
 */
export function ProjectLiveRuns({ projectId, roster, agents, onSummonAnother }: ProjectLiveRunsProps) {
  const t = useTranslations();
  const runsQ = useRuns({ projectId, limit: 100 });
  const [expanded, setExpanded] = useState(false);
  // Client-side "not now" dismissal, keyed by run id — a new turn gets a new
  // id, so a real reply or fresh question re-shows the card.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const runs = useMemo(() => runsQ.data ?? [], [runsQ.data]);
  const live = runningRuns(runs);
  const awaiting = useMemo(
    () => runsAwaitingReply(runs, roster).filter((r) => !dismissedIds.has(r.id)),
    [runs, roster, dismissedIds],
  );
  const activeId = awaiting.some((r) => r.id === openId) ? openId : awaiting[0]?.id;
  const shown = expanded ? live : live.slice(0, VISIBLE_CAP);
  const totals = live.reduce(
    (acc, r) => ({ tokens: acc.tokens + r.tokensIn + r.tokensOut, cost: acc.cost + r.cost }),
    { tokens: 0, cost: 0 },
  );
  const isEmpty = live.length === 0 && awaiting.length === 0;
  const crew = useMemo(
    () => [...new Set(roster.map((i) => i.agentId))]
      .slice(0, CREW_CAP)
      .map((id) => agents.find((a) => a.id === id)?.unitChoice ?? unitForAgent(id)),
    [roster, agents],
  );
  const who = (run: PersistedRun) => {
    const agent = agents.find((a) => a.id === run.agentId);
    return {
      name: agent ? agentDisplayName(agent) : formatAgentDisplayName(run.agentName),
      unit: agent?.unitChoice ?? unitForAgent(run.agentId),
    };
  };

  return (
    <div className="flex-1 min-w-[min(100%,320px)] rounded-[24px] surface-sheen shadow-[var(--lift)] px-[20px] py-[18px] flex flex-col">
      <div className="flex items-center gap-[8px]">
        <span className="text-[15px] font-bold whitespace-nowrap mr-[2px]">Live runs</span>
        {live.length > 0 && <CountPill tone="green" label={`${live.length} ACTIVE`} />}
        {awaiting.length > 0 && <CountPill tone="amber" label={`${awaiting.length} NEED YOU`} />}
        <span className="flex-1" />
        {live.length > VISIBLE_CAP && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-0 border-none bg-transparent text-[12.5px] font-semibold text-acc cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-txt"
          >
            {expanded ? "Show less" : `Load more (${live.length - VISIBLE_CAP})`}
          </button>
        )}
      </div>

      {awaiting.length > 0 && (
        <div className="flex flex-col gap-[6px] mt-[14px]">
          {awaiting.map((run) => (
            <ReplyCard
              key={run.id}
              projectId={projectId}
              target={run}
              who={who(run)}
              sessionLabel={sessionLabelFor(roster, run, t)}
              open={run.id === activeId}
              autoFocus={run.id === focusId}
              onOpen={() => { setOpenId(run.id); setFocusId(run.id); }}
              onDismiss={() => setDismissedIds((prev) => new Set(prev).add(run.id))}
            />
          ))}
        </div>
      )}

      {live.length > 0 && (
        <div className="flex flex-col gap-[6px] mt-[14px]">
          {shown.map((run, i) => (
            <LiveRunRow key={run.id} run={run} who={who(run)} sessionLabel={sessionLabelFor(roster, run, t)} index={i} />
          ))}
        </div>
      )}

      {runsQ.isPending ? (
        <span className="flex-1" />
      ) : runsQ.isError ? (
        <p className="m-0 flex-1 flex items-center justify-center text-[12.5px] text-txt-3">Couldn&apos;t load runs.</p>
      ) : isEmpty ? (
        <LiveRunsEmpty crew={crew} onSummonAnother={onSummonAnother} />
      ) : (
        <>
          <span className="flex-1" />
          <div className="flex items-center gap-[16px] mt-[14px] pt-[13px]">
            <span className="font-mono text-[11px] text-txt-4 whitespace-nowrap">{totals.tokens.toLocaleString("en-US")} tok</span>
            <span className="font-mono text-[11px] text-txt-4 whitespace-nowrap">{formatMoney(totals.cost)} combined</span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={onSummonAnother}
              className="flex items-center gap-[7px] px-[14px] py-[8px] rounded-[11px] border border-edge-2 bg-card text-txt-2 text-[12px] font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-all duration-150 hover:text-txt hover:border-txt-4"
            >
              <Icon name="plus" size={13} /> Summon another
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CountPill({ tone, label }: { tone: "green" | "amber"; label: string }) {
  return (
    <span className={cn(
      "flex items-center gap-[6px] px-[9px] py-[3px] rounded-full text-[10.5px] font-bold whitespace-nowrap shrink-0",
      tone === "green" ? "bg-green-soft text-green" : "bg-amber-soft text-amber",
    )}>
      <span
        className={cn("w-[5px] h-[5px] rounded-full animate-[lrPing_2.4s_cubic-bezier(0,0,.2,1)_infinite]", tone === "green" ? "bg-green" : "bg-amber")}
        style={tone === "amber" ? { animationDelay: "1.2s" } : undefined}
      />
      {label}
    </span>
  );
}

function Sheen({ background, duration, delay }: { background: string; duration: string; delay?: string }) {
  return (
    <span
      aria-hidden
      className="absolute top-[-20%] left-0 w-[38%] h-[140%] pointer-events-none"
      style={{ background, animation: `lrSheen ${duration} cubic-bezier(.45,0,.25,1) infinite`, animationDelay: delay }}
    />
  );
}

/** Ticks once a second on its own so a live row's clock moves without re-rendering the panel. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{formatDuration(now - since)}</>;
}

type Who = { name: string; unit: OfficeAgent["unitChoice"] };

function LiveRunRow({ run, who, sessionLabel, index }: { run: PersistedRun; who: Who; sessionLabel: string | null; index: number }) {
  const costWords = useCostWords();
  const select = useOfficeStore((s) => s.select);
  const tool = run.currentTool;
  const sheenDelay = `${(index * 1.3).toFixed(1)}s`;
  return (
    <button
      type="button"
      onClick={() => select(run.agentId, { instanceId: run.instanceId ?? null, tab: "conversation" })}
      title={run.prompt}
      style={{ animationDelay: `${index * 60}ms` }}
      className={cn(
        "relative overflow-hidden w-full flex items-center gap-[11px] px-[12px] py-[10px] rounded-[14px] bg-card-2 border border-edge shadow-[var(--inset-hi)] text-left text-txt cursor-pointer",
        "transition-[border-color,background-color,translate,box-shadow] duration-[220ms] ease-[cubic-bezier(.2,.8,.2,1)]",
        "hover:border-edge-2 hover:bg-card-3 hover:-translate-y-[1px] hover:shadow-[var(--inset-hi),0_10px_24px_-16px_rgba(0,0,0,.9)]",
        "animate-[lrIn_460ms_cubic-bezier(.2,.8,.2,1)_both]",
      )}
    >
      <Sheen background={LIVE_SHEEN} duration="4.8s" delay={sheenDelay} />
      <span className="relative shrink-0">
        <AgentAvatar unit={who.unit} size={34} className="block rounded-none object-contain" />
        <span
          className="absolute bottom-[-1px] right-[-1px] w-[9px] h-[9px] rounded-full border-2 border-card-2 bg-green text-green animate-[lrPing_2.4s_cubic-bezier(0,0,.2,1)_infinite]"
          style={{ animationDelay: sheenDelay }}
        />
      </span>
      <span className="relative flex-1 min-w-0 flex flex-col gap-[3px]">
        <span className="flex items-center gap-[7px] min-w-0">
          <span className="text-[13px] font-bold whitespace-nowrap truncate">{who.name}</span>
          <span className="shrink-0 text-[10px] font-semibold px-[6px] py-[1px] rounded-[5px] bg-acc-soft text-acc whitespace-nowrap">{run.model}</span>
          {sessionLabel && <span className="text-[10.5px] text-txt-4 whitespace-nowrap truncate">· {sessionLabel}</span>}
        </span>
        <span className="flex items-center gap-[6px] min-w-0" title={tool ? `Running ${tool}` : "Thinking"}>
          <span key={`chip-${tool ?? ""}`} className="shrink-0 w-[15px] h-[15px] flex items-center justify-center rounded-[4px] bg-card-3 text-txt-3 animate-[lrIn_260ms_cubic-bezier(.2,.8,.2,1)_both]">
            {tool ? <ToolIcon name={tool} size={10} /> : <Icon name="activity" size={10} />}
          </span>
          <span key={`tool-${tool ?? ""}`} className="font-mono text-[11px] text-txt-3 truncate animate-[lrIn_260ms_cubic-bezier(.2,.8,.2,1)_both]">{tool ?? "Thinking…"}</span>
          <span aria-hidden className="w-[4px] h-[4px] rounded-full bg-green shrink-0 animate-[lrBreath_2.2s_ease-in-out_infinite]" />
        </span>
      </span>
      <span className="relative shrink-0 flex flex-col items-end gap-[3px]">
        <span className="font-mono text-[11.5px] text-txt-2 whitespace-nowrap tabular-nums"><Elapsed since={run.ts} /></span>
        <span className="font-mono text-[10px] text-txt-4 whitespace-nowrap">{formatRunCost(run.cost, run.costBasis, costWords)}</span>
      </span>
      <Icon name="chevron" size={13} className="relative shrink-0 text-txt-4" />
    </button>
  );
}

/** Posts straight into `target`'s session via the real summon API — the round-trip this feature exists to test. */
function ReplyCard({ projectId, target, who, sessionLabel, open, autoFocus, onOpen, onDismiss }: {
  projectId: string;
  target: PersistedRun;
  who: Who;
  /** Which instance this is, when the agent has more than one — see
   *  `sessionLabelFor`. `null` when there's nothing to disambiguate. */
  sessionLabel: string | null;
  open: boolean;
  autoFocus: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const summon = useSummon();
  const cardRef = useRef<HTMLDivElement>(null);

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

  // A scripted animation outranks the card's CSS entrance animation, whose
  // `both` fill would otherwise pin opacity/transform and swallow the exit.
  const dismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = cardRef.current;
    if (!el) return onDismiss();
    el.animate(
      [
        { opacity: 1, transform: "none", maxHeight: `${el.offsetHeight}px` },
        { opacity: 0, transform: "scale(.97) translateY(-4px)", maxHeight: "0px" },
      ],
      { duration: 360, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" },
    ).finished.then(onDismiss, onDismiss);
  };

  return (
    <div ref={cardRef} className={cn("relative overflow-hidden rounded-[14px] bg-amber-soft", IN)}>
      {open && <Sheen background={REPLY_SHEEN} duration="5.6s" />}
      <div
        onClick={open ? undefined : onOpen}
        onKeyDown={open ? undefined : (e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
        role={open ? undefined : "button"}
        tabIndex={open ? undefined : 0}
        aria-expanded={open}
        className={cn("relative flex items-center gap-[9px] pt-[9px] pr-[10px] pb-[9px] pl-[12px] rounded-[14px]", !open && "cursor-pointer")}
      >
        <AgentAvatar unit={who.unit} size={24} className="rounded-none object-contain" />
        <span className="text-[10.5px] font-bold tracking-[0.06em] uppercase text-amber whitespace-nowrap">
          Reply to {who.name}
        </span>
        {sessionLabel && (
          <span className="text-[10.5px] font-semibold text-[color-mix(in_srgb,var(--amber)_70%,transparent)] whitespace-nowrap truncate">
            · {sessionLabel}
          </span>
        )}
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-txt-4 whitespace-nowrap">{relativeTime(target.ts + target.durMs)}</span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          title="Not now — dismiss this reply prompt"
          className="shrink-0 w-[22px] h-[22px] flex items-center justify-center rounded-[6px] border-none bg-transparent text-[color-mix(in_srgb,var(--amber)_70%,transparent)] cursor-pointer transition-colors duration-150 hover:bg-black/15 hover:text-amber"
        >
          <Icon name="x" size={11} />
        </button>
      </div>
      {open && (
        <div className="relative flex flex-col gap-[9px] px-[12px] pb-[12px] animate-[lrIn_360ms_cubic-bezier(.2,.8,.2,1)_both]">
          <p className="m-0 text-[12px] leading-[1.5] text-txt-2 line-clamp-2" title={target.output}>{questionOf(target.output)}</p>
          <div className="flex items-center gap-[8px]">
            <input
              autoFocus={autoFocus}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Type your reply…"
              aria-label={`Reply to ${who.name}`}
              disabled={summon.isPending}
              className="flex-1 min-w-0 px-[11px] py-[8px] rounded-[10px] bg-card border border-edge text-[12px] text-txt outline-none transition-colors duration-150 placeholder:text-txt-4 focus:border-[color-mix(in_srgb,var(--amber)_55%,transparent)] disabled:opacity-60"
            />
            <button
              type="button"
              onClick={send}
              disabled={!text.trim() || summon.isPending}
              className={cn(
                "shrink-0 px-[14px] py-[8px] rounded-[10px] border-none bg-amber text-[#1a1204] text-[12px] font-bold cursor-pointer whitespace-nowrap transition-[filter,opacity] duration-150 hover:brightness-[1.08] disabled:opacity-50 disabled:cursor-not-allowed",
                summon.isPending && "disabled:opacity-100",
              )}
            >
              {summon.isPending ? "Sending…" : "Send"}
            </button>
          </div>
          {error && (
            <p role="alert" className="m-0 flex items-center gap-[6px] text-[11px] text-red">
              <Icon name="alert-circle" size={12} />
              <span className="min-w-0 truncate">{error}</span>
              <span className="flex-1" />
              <button type="button" onClick={send} className="shrink-0 p-0 border-none bg-transparent text-red text-[11px] font-bold cursor-pointer hover:underline">
                Retry
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
