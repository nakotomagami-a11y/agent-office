"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { AgentInstance, PersistedRun } from "@agent-office/domain/types";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Icon } from "@/components/ui/icon";
import { ModalShell } from "@/components/ui/modal-shell";
import { AgentQuickView } from "@/components/layout/agent-quick-view";
import { formatMoney } from "@/components/layout/quick-view-format";
import { LIVE_STATUSES } from "@/components/layout/roster-row-controls";
import type { RosterGroupData } from "@/components/layout/roster-group";
import { cn } from "@/lib/cn";
import { agentDisplayName } from "@/lib/agent-display-name";
import { categorize } from "@/modules/agents/form/categorize";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { useRosterDisplay } from "@/modules/office/hooks/use-roster-display";
import { useSpawnInstance } from "@/modules/office/hooks/use-spawn-instance";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { useProjectSpend } from "../hooks/use-project-spend";
import { runsAwaitingReply } from "../format/run-stats";

const STACK_CAP = 4;
const NO_EXPANDED: Record<string, string[]> = {};

type Tone = "green" | "amber" | "red" | "grey";

const PILL: Record<Tone, string> = {
  green: "bg-green-soft text-green",
  amber: "bg-amber-soft text-amber",
  red: "bg-red-soft text-red",
  grey: "bg-card-3 text-txt-3 border border-edge",
};

const DOT: Record<Tone, string> = {
  green: "bg-green",
  amber: "bg-amber",
  red: "bg-red",
  grey: "bg-txt-4",
};

export type HeroRosterProps = {
  projectId: string;
  projectName: string;
  roster: AgentInstance[];
  allAgents: OfficeAgent[];
};

/** The hero's overlapping avatar stack, its sidebar hover cards, and the "+N" whole-roster modal. */
export function HeroRoster({ projectId, projectName, roster, allAgents }: HeroRosterProps) {
  const runsQ = useRuns({ projectId, limit: 100 });
  const runs = useMemo(() => runsQ.data ?? [], [runsQ.data]);
  const project = useMemo(() => ({ meta: { name: projectName, roster } }), [projectName, roster]);
  const { rosterGroups } = useRosterDisplay({ agents: allAgents, runs, project, expandedGroups: NO_EXPANDED, activeProjectId: projectId });
  const spendByInstance = useProjectSpend(projectId).data?.byInstance ?? {};
  const { spawnInstance } = useSpawnInstance({ activeProjectId: projectId });
  const select = useOfficeStore((s) => s.select);
  const [allOpen, setAllOpen] = useState(false);

  if (rosterGroups.length === 0) return null;

  const open = (agentId: string, instanceId: string) => select(agentId, { instanceId, tab: "conversation" });
  const shown = rosterGroups.slice(0, STACK_CAP);
  const more = rosterGroups.length - shown.length;

  return (
    <div className="relative flex items-center">
      {shown.map((group, i) => (
        <StackAvatar
          key={group.agentId}
          group={group}
          runs={runs}
          first={i === 0}
          z={STACK_CAP - i}
          spendByInstance={spendByInstance}
          onOpen={(instanceId) => open(group.agentId, instanceId)}
          onSpawn={(agentId) => void spawnInstance(agentId)}
        />
      ))}
      {more > 0 && (
        <button
          type="button"
          onClick={() => setAllOpen(true)}
          title="Show whole roster"
          className="relative flex items-center justify-center w-[30px] h-[30px] ml-[-9px] rounded-full bg-card-3 border-2 border-card text-[10.5px] font-bold text-txt-3 cursor-pointer transition-all duration-[180ms] ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-[3px] hover:text-txt hover:bg-card-2 hover:shadow-[0_8px_18px_-8px_rgba(0,0,0,.9)]"
        >
          +{more}
        </button>
      )}
      <RosterModal
        open={allOpen}
        onClose={() => setAllOpen(false)}
        projectName={projectName}
        groups={rosterGroups}
        awaiting={runsAwaitingReply(runs, roster)}
        spendByInstance={spendByInstance}
        onOpen={(agentId, instanceId) => { setAllOpen(false); open(agentId, instanceId); }}
      />
    </div>
  );
}

function StackAvatar({ group, runs, first, z, spendByInstance, onOpen, onSpawn }: {
  group: RosterGroupData;
  runs: PersistedRun[];
  first: boolean;
  z: number;
  spendByInstance: Record<string, number>;
  onOpen: (instanceId: string) => void;
  onSpawn: (agentId: string) => void;
}) {
  const liveIdx = group.instanceStatuses.findIndex((s) => LIVE_STATUSES.includes(s));
  const target = group.instances[Math.max(0, liveIdx)]!;
  const subject = group.instances.length > 1
    ? { kind: "group" as const, group, runs }
    : { kind: "single" as const, agent: group.agent, instance: target, index: 0, headerMode: "agent" as const };
  const name = agentDisplayName(group.agent);

  return (
    <AgentQuickView subject={subject} spendByInstance={spendByInstance} onSelect={onOpen} onSpawn={onSpawn} placement="bottom">
      {(trigger) => (
        <button
          ref={trigger.ref}
          type="button"
          onMouseEnter={trigger.onMouseEnter}
          onMouseLeave={trigger.onMouseLeave}
          onClick={() => onOpen(target.instanceId)}
          aria-label={name}
          style={{ zIndex: z }}
          className={cn(
            "relative w-[30px] h-[30px] shrink-0 rounded-full cursor-pointer transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(.2,.8,.2,1)]",
            "hover:!z-10 hover:-translate-y-[3px] hover:scale-[1.08] hover:shadow-[0_8px_18px_-8px_rgba(0,0,0,.9)]",
            "focus-visible:!z-10 focus-visible:-translate-y-[3px] focus-visible:scale-[1.08]",
            !first && "ml-[-9px]",
          )}
        >
          <AgentAvatar
            unit={group.agent.unitChoice}
            size={30}
            className={cn("block rounded-full border-2 bg-card-3", liveIdx >= 0 ? "border-green" : "border-card")}
          />
        </button>
      )}
    </AgentQuickView>
  );
}

function RosterModal({ open, onClose, projectName, groups, awaiting, spendByInstance, onOpen }: {
  open: boolean;
  onClose: () => void;
  projectName: string;
  groups: RosterGroupData[];
  awaiting: PersistedRun[];
  spendByInstance: Record<string, number>;
  onOpen: (agentId: string, instanceId: string) => void;
}) {
  const t = useTranslations();
  const awaitingIds = new Set(awaiting.map((r) => r.instanceId));
  const rows = groups.flatMap((g) => g.instances.map((inst, idx) => ({ group: g, inst, idx, status: g.instanceStatuses[idx] ?? "idle" })));
  const working = rows.filter((r) => LIVE_STATUSES.includes(r.status)).length;

  return (
    <ModalShell open={open} onClose={onClose} ariaLabel="Roster" maxWidth={520} bareContent className="rounded-[22px] overflow-hidden max-h-[84vh] animate-[lrIn_260ms_cubic-bezier(.2,.8,.2,1)_both]">
      <div className="flex items-center gap-[12px] pt-[20px] pr-[20px] pb-[14px] pl-[22px]">
        <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
          <span className="text-[17px] font-extrabold tracking-[-0.02em]">Roster</span>
          <span className="font-mono text-[11px] text-txt-4 truncate">
            {projectName} · {rows.length} {rows.length === 1 ? "session" : "sessions"} · {working} working
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-[30px] h-[30px] shrink-0 flex items-center justify-center rounded-[9px] border-none bg-transparent text-txt-4 cursor-pointer transition-colors duration-150 hover:bg-card-3 hover:text-txt"
        >
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-[10px] pb-[10px] flex flex-col gap-[2px]">
        {rows.map(({ group, inst, idx, status }, i) => {
          const tone: Tone =
            LIVE_STATUSES.includes(status) ? "green" :
            status === "error" ? "red" :
            awaitingIds.has(inst.instanceId) || status === "queued" ? "amber" :
            "grey";
          const badge =
            tone === "green" ? "running" :
            tone === "red" ? "failed" :
            awaitingIds.has(inst.instanceId) ? "needs you" :
            status === "queued" ? "queued" :
            status === "done" ? "done" : "idle";
          const name = agentDisplayName(group.agent);
          const label = group.instances.length > 1 ? inst.label || `${name} · ${t("sidebar.session_default_label", { number: idx + 1 })}` : inst.label || name;
          const model = inst.model ?? group.agent.defaultModel ?? "default";
          const spend = spendByInstance[`${group.agentId}|${inst.instanceId}`];
          return (
            <button
              key={inst.instanceId}
              type="button"
              onClick={() => onOpen(group.agentId, inst.instanceId)}
              style={{ animationDelay: `${i * 25}ms` }}
              className="flex items-center gap-[12px] w-full px-[12px] py-[9px] rounded-[12px] text-left cursor-pointer transition-[background,transform] duration-[160ms] hover:bg-card-2 hover:translate-x-[2px] animate-[lrIn_320ms_cubic-bezier(.2,.8,.2,1)_both]"
            >
              <span className="relative shrink-0">
                <AgentAvatar unit={group.agent.unitChoice} size={34} className="block object-contain" />
                <span className={cn("absolute bottom-[-1px] right-[-1px] w-[9px] h-[9px] rounded-full border-2 border-card", DOT[tone])} />
              </span>
              <span className="flex-1 min-w-0 flex flex-col gap-[2px]">
                <span className="text-[13px] font-bold truncate">{label}</span>
                <span className="font-mono text-[10.5px] text-txt-4 truncate">{group.agentId} · {categorize(group.agent)} · {model}</span>
              </span>
              <span className={cn("inline-flex items-center h-[19px] px-[8px] rounded-full font-mono text-[9.5px] font-bold uppercase tracking-[0.03em] whitespace-nowrap shrink-0", PILL[tone])}>
                {badge}
              </span>
              <span className="w-[48px] shrink-0 text-right font-mono text-[11px] text-txt-3">{spend ? formatMoney(spend) : "—"}</span>
              <Icon name="chevron" size={13} className="text-txt-4 shrink-0" />
            </button>
          );
        })}
      </div>
    </ModalShell>
  );
}
