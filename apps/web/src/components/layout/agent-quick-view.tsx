"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Icon, type IconName } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { HoverCard, type HoverCardTrigger } from "@/components/ui/hover-card";
import { LiveSweep } from "@/components/ui/live-sweep";
import { cn } from "@/lib/cn";
import { agentDisplayName } from "@/lib/agent-display-name";
import { categorize } from "@/modules/agents/form/categorize";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { useConversation, useRetryConversation } from "@/modules/summon/hooks/use-conversation";
import { useSkillManifest } from "@/modules/skills/hooks/use-skills";
import { relativeTime } from "@/modules/projects/format/format";
import { formatDuration, formatMoney, formatTokensShort, lastLineOf, truncate } from "./quick-view-format";
import type { AgentStatusInfo } from "@/modules/office/derive/derive-status";
import { LIVE_STATUSES } from "./roster-row-controls";
import type { RosterGroupData } from "./roster-group";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import type { AgentInstance, ConversationView, PersistedRun } from "@agent-office/domain/types";

/**
 * The roster sidebar's hover card. Two shapes, chosen by the caller:
 *  - `group`  — hovering an agent row that has more than one instance (the
 *    roll-up: aggregate status + a per-instance breakdown, no per-instance
 *    fetch — everything comes from data the sidebar already has in hand).
 *  - `single` — hovering an agent row with exactly one instance, or one
 *    session row inside an expanded group. Fetches that one instance's
 *    conversation for the richer, authoritative detail (turns, cost,
 *    context, and the real `needs_attention` state) — bounded to exactly
 *    one request since only one row can be hovered at a time.
 *
 * `headerMode` on `single` decides which of the two real subtitles/stat
 * trios to show — see `SingleInstanceCard` below.
 */
export type QuickViewSubject =
  | { kind: "group"; group: RosterGroupData; runs: PersistedRun[] }
  | {
      kind: "single";
      agent: OfficeAgent;
      instance: AgentInstance;
      index: number;
      headerMode: "agent" | "instance";
    };

/** Re-exported so existing callers (`roster-group.tsx`, `roster-instance-row.tsx`)
 *  keep importing the trigger type from here instead of reaching into `ui/hover-card`. */
export type QuickViewTrigger = HoverCardTrigger;

export interface AgentQuickViewProps {
  subject: QuickViewSubject;
  /** Keyed `"agentId|instanceId"` — same shape the sidebar already fetches
   *  via `useProjectSpend`. Missing/zero entries fall back to the fetched
   *  conversation's own turn costs inside `SingleInstanceCard`. */
  spendByInstance: Record<string, number>;
  onSelect: (instanceId: string) => void;
  onSpawn: (agentId: string) => void;
  children: (trigger: QuickViewTrigger) => ReactNode;
}

/** Thin `HoverCard` wrapper — see `components/ui/hover-card.tsx` for the
 *  actual show/hide/position fundamentals, shared with `ProjectQuickView`. */
export function AgentQuickView({ subject, spendByInstance, onSelect, onSpawn, children }: AgentQuickViewProps) {
  return (
    <HoverCard
      panel={({ close, maxHeight }) => (
        <QuickViewCard
          subject={subject}
          spendByInstance={spendByInstance}
          onSelect={(instanceId) => { close(); onSelect(instanceId); }}
          onSpawn={(agentId) => { close(); onSpawn(agentId); }}
          maxHeight={maxHeight}
        />
      )}
    >
      {children}
    </HoverCard>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────────

type Tone = "green" | "amber" | "red" | "grey";

const PILL_TONE: Record<Tone, string> = {
  green: "bg-green-soft text-green",
  amber: "bg-amber-soft text-amber",
  red: "bg-red-soft text-status-error",
  grey: "bg-bg-3 text-txt-3 border border-line",
};

const DOT_TONE: Record<Tone, string> = {
  green: "bg-green shadow-[0_0_5px_var(--green)]",
  amber: "bg-amber",
  red: "bg-status-error",
  grey: "bg-txt-4",
};

const MESSAGE_TONE: Record<Tone, string> = {
  green: "bg-green-soft",
  amber: "bg-amber-soft",
  red: "bg-red-soft",
  grey: "bg-bg-2",
};

/** One icon per tone rather than a single hardcoded clock for every state —
 *  a clock reads as "waiting", which fits queued (amber) but is misleading
 *  for a live run (green), a stopped run (red), or a session that's never
 *  run at all (grey). */
const MESSAGE_ICON: Record<Tone, IconName> = {
  green: "activity",
  amber: "clock",
  red: "stop",
  grey: "moon",
};

function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-[5px] px-[8px] h-[19px] rounded-full font-[var(--font-mono)] text-[9.5px] font-bold uppercase tracking-[0.03em] whitespace-nowrap", PILL_TONE[tone])}>
      <span className={cn("w-[5px] h-[5px] rounded-full shrink-0", DOT_TONE[tone])} />
      {children}
    </span>
  );
}

function MessageBox({ tone, title, sub }: { tone: Tone; title: string; sub?: string }) {
  return (
    <div className={cn("relative overflow-hidden flex items-start gap-[8px] rounded-[10px] px-[10px] py-[8px]", MESSAGE_TONE[tone])}>
      {(tone === "green" || tone === "amber") && <LiveSweep />}
      <Icon name={MESSAGE_ICON[tone]} size={13} className="shrink-0 mt-[2px] text-txt-3" />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] leading-[1.4] text-txt line-clamp-2">{title}</div>
        {sub && <div className="mt-[3px] font-[var(--font-mono)] text-[10px] text-txt-3">{sub}</div>}
      </div>
    </div>
  );
}

function StatRow({ children }: { children: ReactNode }) {
  return <div className="flex gap-[6px]">{children}</div>;
}

function StatBox({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex-1 min-w-0 rounded-[9px] border border-line bg-bg-2 px-[9px] py-[7px]">
      <div className="text-[8.5px] uppercase tracking-[0.08em] text-txt-4 font-bold truncate">{label}</div>
      <div className={cn("mt-[3px] font-[var(--font-mono)] text-[12.5px] font-semibold text-txt truncate", valueClass)}>{value}</div>
    </div>
  );
}

function CardHeader({ unit, name, badge, subtitle }: {
  unit: OfficeAgent["unitChoice"];
  name: string;
  badge: ReactNode;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-[10px]">
      <AgentAvatar unit={unit} size={52} className="rounded-[12px] shrink-0" />
      <div className="min-w-0 flex-1 pt-[1px]">
        <div className="flex items-center gap-[7px] min-w-0">
          <span className="text-[14px] font-bold text-txt truncate">{name}</span>
          {badge}
        </div>
        <div className="mt-[2px] font-[var(--font-mono)] text-[10.5px] text-txt-3 truncate">{subtitle}</div>
      </div>
    </div>
  );
}

function DescriptionAndTags({ agent }: { agent: OfficeAgent }) {
  const manifestQ = useSkillManifest();
  const skills = agent.skills ?? [];
  const tags = skills.slice(0, 3).map((slug) => ({
    slug,
    tokenCost: manifestQ.data?.skills.find((s) => s.slug === slug)?.token_cost_est,
  }));
  return (
    <div className="flex flex-col gap-[8px]">
      {agent.description && (
        <p className="text-[11.5px] leading-[1.45] text-txt-3 line-clamp-2 m-0">{agent.description}</p>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-[5px]">
          {tags.map((tag) => (
            <span
              key={tag.slug}
              className="inline-flex items-center gap-[5px] px-[7px] h-[20px] rounded-[6px] bg-bg-3 border border-line text-txt-3 font-[var(--font-mono)] text-[10px] whitespace-nowrap"
            >
              {tag.slug}
              {tag.tokenCost != null && <span className="text-txt-4">{formatTokensShort(tag.tokenCost)}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CardFooter({ primaryLabel, onPrimary, secondaryLabel, onSecondary }: {
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
}) {
  return (
    <div className="flex items-center gap-[8px]">
      <Button variant="primary" size="sm" onClick={onPrimary} className="flex-1 justify-center">
        {primaryLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={onSecondary} className="border border-line-2">
        {secondaryLabel}
      </Button>
    </div>
  );
}

function CardShell({ children, maxHeight }: { children: ReactNode; maxHeight?: number }) {
  return (
    <div
      className="w-[336px] rounded-[16px] border border-edge-2 bg-card-2 p-[14px] flex flex-col gap-[12px] overflow-y-auto"
      style={maxHeight ? { maxHeight } : undefined}
    >
      {children}
    </div>
  );
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function lastRunForInstance(instanceId: string, runs: PersistedRun[]): PersistedRun | undefined {
  let best: PersistedRun | undefined;
  for (const r of runs) {
    if (r.instanceId !== instanceId) continue;
    if (!best || r.ts > best.ts) best = r;
  }
  return best;
}


// ── Dispatcher ───────────────────────────────────────────────────────────────

function QuickViewCard({ subject, spendByInstance, onSelect, onSpawn, maxHeight }: {
  subject: QuickViewSubject;
  spendByInstance: Record<string, number>;
  onSelect: (instanceId: string) => void;
  onSpawn: (agentId: string) => void;
  maxHeight: number;
}) {
  if (subject.kind === "single") {
    return (
      <SingleInstanceCard
        agent={subject.agent}
        instance={subject.instance}
        index={subject.index}
        headerMode={subject.headerMode}
        spendByInstance={spendByInstance}
        onSelect={onSelect}
        onSpawn={onSpawn}
        maxHeight={maxHeight}
      />
    );
  }
  return (
    <GroupCard
      group={subject.group}
      runs={subject.runs}
      spendByInstance={spendByInstance}
      onSelect={onSelect}
      onSpawn={onSpawn}
      maxHeight={maxHeight}
    />
  );
}

// ── Group card (rolled-up view over every instance of an agent) ────────────

function GroupCard({ group, runs, spendByInstance, onSelect, onSpawn, maxHeight }: {
  group: RosterGroupData;
  runs: PersistedRun[];
  spendByInstance: Record<string, number>;
  onSelect: (instanceId: string) => void;
  onSpawn: (agentId: string) => void;
  maxHeight: number;
}) {
  const t = useTranslations();
  const { agent, instances, instanceStatuses } = group;

  const errorCount = instanceStatuses.filter((s) => s === "error").length;
  const liveCount = instanceStatuses.filter((s) => LIVE_STATUSES.includes(s)).length;
  const queuedCount = instanceStatuses.filter((s) => s === "queued").length;

  const badge =
    errorCount > 0 ? <StatusPill tone="red">{t("sidebar.quick_view.group_badge_failed", { count: errorCount })}</StatusPill> :
    liveCount > 0 ? <StatusPill tone="green">{t("sidebar.quick_view.group_badge_running", { count: liveCount })}</StatusPill> :
    queuedCount > 0 ? <StatusPill tone="amber">{t("sidebar.quick_view.group_badge_queued", { count: queuedCount })}</StatusPill> :
    null;

  // The single most-urgent instance drives the message box + primary action.
  const order: AgentStatusInfo["status"][] = ["idle", "done", "queued", "thinking", "working", "error"];
  let bestIdx = 0;
  for (let i = 1; i < instances.length; i++) {
    const s = instanceStatuses[i] ?? "idle";
    const bestS = instanceStatuses[bestIdx] ?? "idle";
    if (order.indexOf(s) > order.indexOf(bestS)) bestIdx = i;
  }
  const bestInstance = instances[bestIdx];
  const bestStatus = instanceStatuses[bestIdx] ?? "idle";
  const bestRun = bestInstance ? lastRunForInstance(bestInstance.instanceId, runs) : undefined;

  const messageTone: Tone =
    bestStatus === "error" ? "red" :
    LIVE_STATUSES.includes(bestStatus) ? "green" :
    bestStatus === "queued" ? "amber" :
    "grey";

  const messageTitle = bestRun
    ? bestStatus === "error"
      ? t("sidebar.quick_view.message_error", { code: String(bestRun.exitCode ?? 1) })
      : truncate(lastLineOf(bestRun), 90)
    : t("sidebar.quick_view.message_never_run_group");
  const messageSub = bestRun
    ? LIVE_STATUSES.includes(bestStatus)
      ? `${formatDuration(Date.now() - bestRun.ts)} ${t("sidebar.quick_view.elapsed_suffix")}`
      : `${relativeTime(bestRun.ts)} · ${formatDuration(bestRun.durMs)}`
    : undefined;

  const totalSpend = instances.reduce(
    (sum, inst) => sum + (spendByInstance[`${agent.id}|${inst.instanceId}`] ?? 0),
    0,
  );
  const model = agent.defaultModel ?? "default";

  return (
    <CardShell maxHeight={maxHeight}>
      <CardHeader
        unit={agent.unitChoice}
        name={agentDisplayName(agent)}
        badge={badge}
        subtitle={`${agent.id} · ${categorize(agent)}`}
      />
      <MessageBox tone={messageTone} title={messageTitle} sub={messageSub} />
      <StatRow>
        <StatBox label={t("sidebar.quick_view.stat_instances")} value={String(instances.length)} />
        <StatBox label={t("sidebar.quick_view.stat_open_spend")} value={formatMoney(totalSpend)} />
        <StatBox label={t("sidebar.quick_view.stat_model")} value={model} valueClass="text-acc" />
      </StatRow>
      <div className="flex flex-col gap-[2px]">
        <div className="flex items-center justify-between px-[1px] mb-[2px]">
          <span className="text-[8.5px] uppercase tracking-[0.08em] text-txt-4 font-bold">{t("sidebar.quick_view.instances_header")}</span>
          <span className="font-[var(--font-mono)] text-[9.5px] text-txt-4">
            {t("sidebar.quick_view.instances_summary", { live: liveCount, spend: formatMoney(totalSpend) })}
          </span>
        </div>
        {instances.map((inst, idx) => (
          <GroupInstanceLine
            key={inst.instanceId}
            instance={inst}
            index={idx}
            status={instanceStatuses[idx] ?? "idle"}
            run={lastRunForInstance(inst.instanceId, runs)}
            spend={spendByInstance[`${agent.id}|${inst.instanceId}`]}
          />
        ))}
      </div>
      <DescriptionAndTags agent={agent} />
      <CardFooter
        primaryLabel={LIVE_STATUSES.includes(bestStatus) ? t("sidebar.quick_view.button_watch_run") : t("sidebar.quick_view.button_open")}
        onPrimary={() => bestInstance && onSelect(bestInstance.instanceId)}
        secondaryLabel={t("sidebar.quick_view.button_new_session")}
        onSecondary={() => onSpawn(agent.id)}
      />
    </CardShell>
  );
}

function GroupInstanceLine({ instance, index, status, run, spend }: {
  instance: AgentInstance;
  index: number;
  status: AgentStatusInfo["status"];
  run: PersistedRun | undefined;
  spend: number | undefined;
}) {
  const t = useTranslations();
  const label = instance.label || t("sidebar.session_default_label", { number: index + 1 });
  const dotClass =
    status === "error" ? "bg-status-error" :
    LIVE_STATUSES.includes(status) ? "bg-status-working shadow-[0_0_4px_var(--working)]" :
    status === "queued" ? "bg-amber" :
    "bg-txt-4";

  const sub = !run
    ? t("sidebar.quick_view.no_activity")
    : status === "error"
      ? t("sidebar.quick_view.message_error", { code: String(run.exitCode ?? 1) })
      : LIVE_STATUSES.includes(status)
        ? `${t("sidebar.quick_view.badge_running")} · ${formatDuration(Date.now() - run.ts)}`
        : status === "queued"
          ? t("sidebar.quick_view.badge_queued")
          : `${relativeTime(run.ts)} · ${formatDuration(run.durMs)}`;

  return (
    <div className="flex items-center gap-[8px] py-[4px]">
      <span className={cn("w-[6px] h-[6px] rounded-full shrink-0", dotClass)} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-txt truncate">{label}</div>
        <div className="font-[var(--font-mono)] text-[9.5px] text-txt-3 truncate">{sub}</div>
      </div>
      <span className="font-[var(--font-mono)] text-[10.5px] text-txt-3 shrink-0">{spend ? formatMoney(spend) : "—"}</span>
    </div>
  );
}

// ── Single-instance card (one session's full detail) ───────────────────────

type UiStatus = "never_run" | "running" | "needs_attention" | "queued" | "failed" | "idle";

function messageFor(
  status: UiStatus,
  lastTurn: PersistedRun | undefined,
  conv: ConversationView | null,
  t: (key: string, values?: Record<string, string | number>) => string,
): { title: string; sub?: string } {
  switch (status) {
    case "never_run":
      return { title: t("sidebar.quick_view.message_never_run") };
    case "running": {
      const title = lastTurn?.currentTool
        ? t("sidebar.quick_view.message_running_tool", { tool: lastTurn.currentTool })
        : lastTurn ? truncate(lastLineOf(lastTurn), 90) : t("sidebar.quick_view.message_running");
      const sub = lastTurn ? `${formatDuration(Date.now() - lastTurn.ts)} ${t("sidebar.quick_view.elapsed_suffix")}` : undefined;
      return { title, sub };
    }
    case "needs_attention":
      return {
        title: t("sidebar.quick_view.message_needs_attention"),
        sub: lastTurn ? `${t("sidebar.quick_view.idle_prefix")} ${formatDuration(Date.now() - lastTurn.ts)}` : undefined,
      };
    case "failed":
      return {
        title: t("sidebar.quick_view.message_error", { code: String(lastTurn?.exitCode ?? 1) }),
        sub: lastTurn ? `${relativeTime(lastTurn.ts)} · exit ${lastTurn.exitCode ?? 1}` : undefined,
      };
    case "queued": {
      const q = conv?.queue[0];
      return {
        title: q ? t("sidebar.quick_view.message_queued", { text: truncate(q.text, 60) }) : t("sidebar.quick_view.message_idle"),
        sub: q ? `${t("sidebar.quick_view.queued_prefix")} ${formatDuration(Date.now() - q.createdAt)}` : undefined,
      };
    }
    case "idle":
    default:
      return {
        title: lastTurn ? truncate(lastLineOf(lastTurn), 90) : t("sidebar.quick_view.message_idle"),
        sub: lastTurn ? `${relativeTime(lastTurn.ts)} · ${formatDuration(lastTurn.durMs)}` : undefined,
      };
  }
}

function SingleInstanceCard({ agent, instance, index, headerMode, spendByInstance, onSelect, onSpawn, maxHeight }: {
  agent: OfficeAgent;
  instance: AgentInstance;
  index: number;
  headerMode: "agent" | "instance";
  spendByInstance: Record<string, number>;
  onSelect: (instanceId: string) => void;
  onSpawn: (agentId: string) => void;
  maxHeight: number;
}) {
  const t = useTranslations();
  const select = useOfficeStore((s) => s.select);
  const convQ = useConversation(agent.id, instance.instanceId);
  const retryMut = useRetryConversation();

  if (convQ.isLoading) {
    return (
      <CardShell maxHeight={maxHeight}>
        <div className="h-[64px] flex items-center justify-center text-txt-4 text-[11px]">
          {t("sidebar.quick_view.loading")}
        </div>
      </CardShell>
    );
  }

  const conv = convQ.data ?? null;
  const turns = conv?.turns ?? [];
  const lastTurn = turns[turns.length - 1];
  const model = instance.model ?? agent.defaultModel ?? "default";
  const effort = instance.effort ?? agent.defaultEffort ?? "default";
  const spendKey = `${agent.id}|${instance.instanceId}`;
  const turnsCost = turns.reduce((sum, r) => sum + r.cost, 0);
  const cost = spendByInstance[spendKey] || turnsCost;
  const runtimeMs = turns.reduce((sum, r) => sum + r.durMs, 0);

  const status: UiStatus =
    !conv || turns.length === 0 ? "never_run" :
    conv.status === "running" ? "running" :
    conv.status === "needs_attention" ? "needs_attention" :
    conv.queue.length > 0 ? "queued" :
    lastTurn?.status === "error" ? "failed" :
    "idle";

  const badgeTone: Tone =
    status === "running" ? "green" :
    status === "needs_attention" || status === "queued" ? "amber" :
    status === "failed" ? "red" :
    "grey";

  const label = instance.label || t("sidebar.session_default_label", { number: index + 1 });
  const heading = headerMode === "instance" ? label : agentDisplayName(agent);
  const subtitle = headerMode === "instance"
    ? `${agentDisplayName(agent)} · ${model} · ${effort}`
    : `${agent.id} · ${categorize(agent)}`;

  const { title, sub } = messageFor(status, lastTurn, conv, t);

  const primaryLabel =
    status === "never_run" ? t("sidebar.quick_view.button_start_session") :
    status === "running" ? t("sidebar.quick_view.button_watch_run") :
    status === "needs_attention" ? t("sidebar.quick_view.button_resolve") :
    status === "failed" ? t("sidebar.quick_view.button_retry") :
    t("sidebar.quick_view.button_open");

  const handlePrimary = () => {
    if (status === "failed" && conv) retryMut.mutate(conv.id);
    onSelect(instance.instanceId);
  };

  const secondaryLabel = status === "never_run" ? t("sidebar.quick_view.button_edit_agent") : t("sidebar.quick_view.button_new_session");
  const handleSecondary = () => {
    if (status === "never_run") select(agent.id, { instanceId: instance.instanceId, tab: "customization" });
    else onSpawn(agent.id);
  };

  return (
    <CardShell maxHeight={maxHeight}>
      <CardHeader
        unit={agent.unitChoice}
        name={heading}
        badge={<StatusPill tone={badgeTone}>{t(`sidebar.quick_view.badge_${status}`)}</StatusPill>}
        subtitle={subtitle}
      />
      <MessageBox tone={badgeTone} title={title} sub={sub} />
      <StatRow>
        {headerMode === "instance" ? (
          <>
            <StatBox label={t("sidebar.quick_view.stat_cost")} value={cost > 0 ? formatMoney(cost) : "—"} />
            <StatBox label={t("sidebar.quick_view.stat_turns")} value={String(turns.length)} />
            <StatBox label={t("sidebar.quick_view.stat_runtime")} value={runtimeMs > 0 ? formatDuration(runtimeMs) : "—"} />
          </>
        ) : (
          <>
            <StatBox label={t("sidebar.quick_view.stat_session")} value={cost > 0 ? formatMoney(cost) : "—"} />
            <StatBox label={t("sidebar.quick_view.stat_model")} value={model} valueClass="text-acc" />
            <StatBox label={t("sidebar.quick_view.stat_effort")} value={effort} valueClass="text-cyan" />
          </>
        )}
      </StatRow>
      <DescriptionAndTags agent={agent} />
      <CardFooter
        primaryLabel={primaryLabel}
        onPrimary={handlePrimary}
        secondaryLabel={secondaryLabel}
        onSecondary={handleSecondary}
      />
    </CardShell>
  );
}
