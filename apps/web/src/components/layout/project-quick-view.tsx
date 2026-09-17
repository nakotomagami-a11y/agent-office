"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { PersistedRun, PlanetConfig, Tab } from "@agent-office/domain/types";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Icon } from "@/components/ui/icon";
import { PlanetCanvas } from "@/components/ui/planet-canvas";
import { HoverCard, type HoverCardTrigger } from "@/components/ui/hover-card";
import { LiveSweep } from "@/components/ui/live-sweep";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { cn } from "@/lib/cn";
import { useTabsStore } from "@/lib/tabs-store";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { useProject, useGitStatus } from "@/modules/projects/hooks/use-projects";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { useProcesses } from "@/modules/processes/hooks/use-processes";
import { computeRunStats, runningRuns, runsAwaitingReply } from "@/modules/projects/format/run-stats";
import { relativeTime } from "@/modules/projects/format/format";
import { formatDuration, formatMoney, lastLineOf, truncate } from "./quick-view-format";

/**
 * The project tab strip's hover card — same `HoverCard` fundamentals as the
 * roster's `AgentQuickView` (see that file's history for why: a bespoke
 * `display:contents` trigger wrapper made the card close itself on its own).
 * Fetches on demand (only while a tab is actually hovered): the project's
 * git status, its runs (for the live/awaiting-reply rollup — reusing the
 * exact same `runningRuns`/`runsAwaitingReply`/`computeRunStats` helpers the
 * project dashboard's own "Live runs" panel already uses), and the global
 * dev-server process list (filtered client-side to this project).
 */
export interface ProjectQuickViewProps {
  tab: Tab;
  isActive: boolean;
  projectName: string;
  projectPlanet: PlanetConfig | undefined;
  children: (trigger: HoverCardTrigger) => ReactNode;
}

export function ProjectQuickView({ tab, isActive, projectName, projectPlanet, children }: ProjectQuickViewProps) {
  return (
    <HoverCard
      width={344}
      placement="bottom"
      panel={({ close, maxHeight }) => (
        <ProjectCard
          tab={tab}
          isActive={isActive}
          projectName={projectName}
          projectPlanet={projectPlanet}
          onDone={close}
          maxHeight={maxHeight}
        />
      )}
    >
      {children}
    </HoverCard>
  );
}

// ── Shared bits — same tone vocabulary as `agent-quick-view.tsx` ──────────

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

function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-[5px] px-[8px] h-[19px] rounded-full font-[var(--font-mono)] text-[9.5px] font-bold uppercase tracking-[0.03em] whitespace-nowrap", PILL_TONE[tone])}>
      <span className={cn("w-[5px] h-[5px] rounded-full shrink-0", DOT_TONE[tone])} />
      {children}
    </span>
  );
}

function StatBox({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex-1 min-w-0 rounded-[9px] border border-line bg-bg-2 px-[9px] py-[7px]">
      <div className="text-[8.5px] uppercase tracking-[0.08em] text-txt-4 font-bold truncate">{label}</div>
      <div className={cn("mt-[3px] font-[var(--font-mono)] text-[13px] font-semibold text-txt truncate", valueClass)}>{value}</div>
    </div>
  );
}

function tildePath(cwd: string): string {
  return cwd.replace(/^\/home\/[^/]+\//, "~/");
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ── The card itself ─────────────────────────────────────────────────────────

function ProjectCard({ tab, isActive, projectName, projectPlanet, onDone, maxHeight }: {
  tab: Tab;
  isActive: boolean;
  projectName: string;
  projectPlanet: PlanetConfig | undefined;
  onDone: () => void;
  maxHeight: number;
}) {
  const t = useTranslations();
  const router = useRouter();
  const setActiveTab = useTabsStore((s) => s.setActiveTab);
  const select = useOfficeStore((s) => s.select);

  const projectQ = useProject(tab.projectId);
  const project = projectQ.data;
  const gitQ = useGitStatus(tab.projectId, !!project?.meta.cwd);
  const runsQ = useRuns({ projectId: tab.projectId, limit: 100 });
  const processesQ = useProcesses(true);

  if (projectQ.isLoading) {
    return (
      <CardShell maxHeight={maxHeight}>
        <div className="h-[64px] flex items-center justify-center text-txt-4 text-[11px]">
          {t("sidebar.quick_view.loading")}
        </div>
      </CardShell>
    );
  }

  const runs = [...(runsQ.data ?? [])].sort((a, b) => b.ts - a.ts);
  const live = runningRuns(runs);
  const awaiting = runsAwaitingReply(runs, project?.meta.roster ?? []);
  const stats = computeRunStats(runs);
  const lastRun = runs[0];
  const neverOpened = (project?.runCount ?? runs.length) === 0;

  const todayStart = startOfDay(Date.now());
  const todayRuns = runs.filter((r) => r.ts >= todayStart);
  const agentsToday = new Set(todayRuns.map((r) => r.agentId)).size;
  const failedToday = todayRuns.filter((r) => r.status === "error").length;
  const sessionsToday = new Set(todayRuns.map((r) => r.instanceId ?? r.agentId)).size;

  const servers = (processesQ.data ?? []).filter((p) => p.projectId === tab.projectId);

  const badge: { tone: Tone; label: string } | null =
    awaiting.length > 0 ? { tone: "amber", label: t("tabs.quick_view.badge_needs_you") } :
    live.length > 0 ? { tone: "green", label: t("tabs.quick_view.badge_running", { count: live.length }) } :
    neverOpened ? { tone: "grey", label: t("tabs.quick_view.badge_never_opened") } :
    lastRun?.status === "error" ? { tone: "red", label: t("tabs.quick_view.badge_last_run_failed") } :
    null;

  // Clicking an agent row switches to its project's tab AND opens that
  // exact agent/instance's conversation — the one action this card offers
  // (no separate footer buttons; the tab itself already switches projects).
  const openAgent = (run: PersistedRun) => {
    onDone();
    setActiveTab(tab.id);
    router.push(tab.currentPath);
    select(run.agentId, { instanceId: run.instanceId ?? null, tab: "conversation" });
  };

  const shownRows = [...awaiting, ...live].slice(0, 3);
  const moreToday = agentsToday - shownRows.length;

  return (
    <CardShell maxHeight={maxHeight}>
      <div className="flex items-start gap-[10px]">
        <PlanetCanvas projectId={tab.projectId} config={projectPlanet} size={52} className="rounded-[12px] shrink-0" />
        <div className="min-w-0 flex-1 pt-[1px]">
          <div className="flex items-center gap-[7px] min-w-0">
            <span className="text-[14px] font-bold text-txt truncate">{projectName}</span>
            {isActive && <Icon name="check" size={11} className="text-acc shrink-0" />}
            {badge && <StatusPill tone={badge.tone}>{badge.label}</StatusPill>}
          </div>
          <div className="flex items-center gap-[8px] mt-[2px] font-[var(--font-mono)] text-[10.5px] text-txt-3">
            {project?.meta.cwd && <span className="truncate">{tildePath(project.meta.cwd)}</span>}
            {project?.lastRunAt && <span className="text-txt-4 shrink-0 ml-auto">{relativeTime(project.lastRunAt)}</span>}
          </div>
        </div>
      </div>

      {gitQ.data?.isGit && (
        <div className="flex items-center gap-[6px] min-w-0">
          {gitQ.data.branch && (
            <span className="inline-flex items-center gap-[5px] px-[8px] h-[20px] rounded-[6px] bg-bg-3 border border-line text-txt-3 font-[var(--font-mono)] text-[10.5px] min-w-0 shrink">
              <Icon name="branch-ao" size={10} className="shrink-0" />
              <span className="truncate">{gitQ.data.branch}</span>
            </span>
          )}
          {gitQ.data.filesChanged === 0 ? (
            <span className="inline-flex items-center px-[8px] h-[20px] rounded-[6px] bg-bg-3 border border-line text-txt-3 font-[var(--font-mono)] text-[10.5px] shrink-0 whitespace-nowrap">
              {t("tabs.quick_view.git_clean")}
            </span>
          ) : (
            <span className="inline-flex items-center px-[8px] h-[20px] rounded-[6px] bg-amber-soft text-amber font-[var(--font-mono)] text-[10.5px] font-semibold shrink-0 whitespace-nowrap">
              {t("tabs.quick_view.git_changed", { count: gitQ.data.filesChanged, added: gitQ.data.added, removed: gitQ.data.removed })}
            </span>
          )}
        </div>
      )}

      {shownRows.length > 0 ? (
        <div className="flex flex-col gap-[2px]">
          <div className="flex items-center justify-between px-[1px] mb-[2px]">
            <span className="text-[8.5px] uppercase tracking-[0.08em] text-txt-4 font-bold">{t("tabs.quick_view.agents_header")}</span>
            <span className="font-[var(--font-mono)] text-[9.5px] text-txt-4">
              {t("tabs.quick_view.agents_summary", { live: live.length, today: agentsToday })}
            </span>
          </div>
          {shownRows.map((run) => (
            <ProjectAgentRow key={run.id} run={run} needsReply={awaiting.includes(run)} onOpen={() => openAgent(run)} />
          ))}
          {moreToday > 0 && (
            <div className="text-[10.5px] text-txt-4 px-[1px] pt-[2px]">
              {t("tabs.quick_view.more_ran_today", { count: moreToday })}
            </div>
          )}
        </div>
      ) : (
        <ActivityBox neverOpened={neverOpened} lastRun={lastRun} t={t} />
      )}

      <div className="flex gap-[6px]">
        <StatBox
          label={t("tabs.quick_view.stat_today")}
          value={stats.spendToday > 0 ? formatMoney(stats.spendToday) : "$0"}
        />
        <StatBox label={t("tabs.quick_view.stat_sessions")} value={String(sessionsToday)} />
        <StatBox label={t("tabs.quick_view.stat_servers")} value={String(servers.length)} />
      </div>
      <div className="flex gap-[6px] -mt-[6px] px-[1px] font-[var(--font-mono)] text-[9.5px] text-txt-4">
        <span className="flex-1">
          {stats.spendToday > 0 ? t("tabs.quick_view.runs_today", { count: todayRuns.length }) : t("tabs.quick_view.no_spend")}
        </span>
        <span className="flex-1">
          {failedToday > 0
            ? t("tabs.quick_view.failed_runs", { count: failedToday })
            : awaiting.length > 0
              ? t("tabs.quick_view.with_unread", { count: awaiting.length })
              : neverOpened
                ? t("tabs.quick_view.never_opened_sub")
                : t("tabs.quick_view.no_unread")}
        </span>
        <span className="flex-1">{servers.length > 0 ? t("tabs.quick_view.all_healthy") : t("tabs.quick_view.none_running")}</span>
      </div>
    </CardShell>
  );
}

function ProjectAgentRow({ run, needsReply, onOpen }: { run: PersistedRun; needsReply: boolean; onOpen: () => void }) {
  const elapsedMs = needsReply ? Date.now() - (run.ts + run.durMs) : Date.now() - run.ts;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "relative overflow-hidden flex items-center gap-[9px] px-[9px] py-[8px] rounded-[10px] text-left cursor-pointer transition-[filter] duration-150 hover:brightness-110",
        needsReply ? "bg-amber-soft" : "bg-green-soft",
      )}
    >
      <LiveSweep />
      <AgentAvatar unit={unitForAgent(run.agentId)} size={34} className="rounded-[8px] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[6px]">
          <span className="text-[12px] font-bold text-txt whitespace-nowrap">{run.agentName}</span>
          <span className="font-[var(--font-mono)] text-[10px] text-txt-3">{run.model}</span>
        </div>
        <div className="text-[11px] text-txt-3 truncate mt-[1px]">
          {needsReply ? `waiting on your answer — "${truncate(lastLineOf(run), 40)}"` : truncate(run.prompt, 46)}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-[var(--font-mono)] text-[11px] text-txt-2 whitespace-nowrap">{formatDuration(elapsedMs)}</div>
        <div className="font-[var(--font-mono)] text-[10px] text-txt-4 mt-[1px] whitespace-nowrap">{formatMoney(run.cost)}</div>
      </div>
    </button>
  );
}

function ActivityBox({ neverOpened, lastRun, t }: {
  neverOpened: boolean;
  lastRun: PersistedRun | undefined;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const title = neverOpened
    ? t("tabs.quick_view.activity_never_opened")
    : lastRun
      ? truncate(lastLineOf(lastRun), 90)
      : t("tabs.quick_view.activity_idle");
  const sub = !neverOpened && lastRun ? relativeTime(lastRun.ts) : undefined;
  return (
    <div>
      <div className="text-[8.5px] uppercase tracking-[0.08em] text-txt-4 font-bold mb-[6px]">{t("tabs.quick_view.activity_header")}</div>
      <div className="rounded-[10px] border border-line bg-bg-2 px-[10px] py-[10px]">
        <div className="text-[12px] leading-[1.4] text-txt-2">{title}</div>
        {sub && <div className="mt-[3px] font-[var(--font-mono)] text-[10px] text-txt-4">{sub}</div>}
      </div>
    </div>
  );
}

function CardShell({ children, maxHeight }: { children: ReactNode; maxHeight?: number }) {
  return (
    <div
      className="rounded-[16px] border border-edge-2 bg-card-2 p-[14px] flex flex-col gap-[12px] overflow-y-auto"
      style={maxHeight ? { maxHeight } : undefined}
    >
      {children}
    </div>
  );
}
