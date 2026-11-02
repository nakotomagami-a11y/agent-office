"use client";

import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { agentDisplayName } from "@/lib/agent-display-name";
import { RosterInstanceRow } from "./roster-instance-row";
import { aggregateStatus, LIVE_STATUSES, RosterActionButton, RosterSessionRow } from "./roster-row-controls";
import { AgentQuickView, type QuickViewTrigger } from "./agent-quick-view";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import type { AgentInstance, PersistedRun } from "@agent-office/domain/types";
import type { AgentStatusInfo } from "@/modules/office/derive/derive-status";

function agentLedClass(status: AgentStatusInfo["status"]) {
  return cn(
    "absolute -bottom-[2px] -right-[2px] w-[8px] h-[8px] rounded-full border-[2px] border-canvas",
    LIVE_STATUSES.includes(status) && "bg-status-working shadow-[0_0_5px_var(--working)]",
    (status === "queued" || status === "done") && "bg-ao-warn",
    status === "error" && "bg-status-error",
    !LIVE_STATUSES.includes(status) && status !== "queued" && status !== "done" && status !== "error" && "bg-txt-4",
  );
}

const HOVER_ACTION = "hidden group-hover:flex group-focus-within:flex shrink-0";

function PinButton({ pinned, onToggle }: { pinned: boolean; onToggle: (e: React.MouseEvent) => void }) {
  const t = useTranslations();
  return (
    <Tooltip content={pinned ? t("sidebar.unpin_title") : t("sidebar.pin_title")} side="top" className={HOVER_ACTION}>
      <RosterActionButton
        active={pinned}
        onClick={onToggle}
        aria-label={pinned ? t("sidebar.unpin_aria") : t("sidebar.pin_aria")}
      >
        <Icon name="pin" size={11} className="size-[11px] [flex:0_0_11px]" />
      </RosterActionButton>
    </Tooltip>
  );
}

export interface RosterGroupData {
  agentId: string;
  agent: OfficeAgent;
  instances: AgentInstance[];
  instanceStatuses: AgentStatusInfo["status"][];
  expanded: boolean;
}

export interface RosterGroupProps {
  group: RosterGroupData;
  projectId: string;
  /** Recent runs across the whole app — used only to derive the quick-view
   *  hover card's "last activity" text per instance (see `agent-quick-view.tsx`). */
  runs: PersistedRun[];
  selectedInstanceId: string | null;
  renamingInstanceId: string | null;
  onSelect: (instanceId: string) => void;
  onSpawn: (agentId: string) => void;
  onRemove: (instanceId: string) => void;
  onToggle: () => void;
  onRenameStart: (instanceId: string) => void;
  onRenameCommit: (instanceId: string, label: string) => void;
  onRenameCancel: () => void;
  spendByInstance?: Record<string, number>;
  pinned?: boolean;
  onTogglePin?: () => void;
}

export function RosterGroup({
  group,
  projectId: _projectId,
  runs,
  selectedInstanceId,
  renamingInstanceId,
  onSelect,
  onSpawn,
  onRemove,
  onToggle,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  spendByInstance = {},
  pinned = false,
  onTogglePin,
}: RosterGroupProps) {
  const t = useTranslations();
  const { agent, instances, instanceStatuses, expanded } = group;
  const isMulti = instances.length > 1;

  const inst = instances[0];
  const singleStatus = instanceStatuses[0] ?? "idle";
  const aggregated = isMulti ? aggregateStatus(instanceStatuses) : singleStatus;
  const hasLive = instanceStatuses.some((s) => LIVE_STATUSES.includes(s));

  const isSelected = !isMulti && inst ? selectedInstanceId === inst.instanceId : false;

  const quickViewSubject = isMulti
    ? { kind: "group" as const, group, runs }
    : inst
      ? { kind: "single" as const, agent, instance: inst, index: 0, headerMode: "agent" as const }
      : null;

  const renderAgentRow = (trigger?: QuickViewTrigger) => (
      <div
        ref={trigger?.ref}
        onMouseEnter={trigger?.onMouseEnter}
        onMouseLeave={trigger?.onMouseLeave}
        className={cn(
          "group relative flex items-center gap-[9px] px-[7px] py-[6px] rounded-[10px] cursor-pointer transition-colors duration-[130ms] hover:bg-card-2 focus-visible:bg-card-2 focus-visible:outline-none",
          isSelected && "bg-acc-faint",
        )}
        onClick={() => isMulti ? onToggle() : (inst && onSelect(inst.instanceId))}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ")
            isMulti ? onToggle() : (inst && onSelect(inst.instanceId));
        }}
        aria-expanded={isMulti ? expanded : undefined}
      >
        <span className="relative w-[30px] h-[30px] shrink-0">
          <AgentAvatar unit={agent.unitChoice} size={30} className="rounded-[9px] bg-card-3 border border-edge" />
          <span className={agentLedClass(aggregated)} />
        </span>

        <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-txt overflow-hidden text-ellipsis whitespace-nowrap">
          {agentDisplayName(agent)}
        </span>

        {isMulti && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            aria-label={t("sidebar.group_toggle_aria", { name: agent.name, count: instances.length })}
            aria-expanded={expanded}
            className={cn(
              "flex items-center gap-[4px] px-[7px] py-[2px] rounded-full text-[10px] font-bold shrink-0 cursor-pointer",
              hasLive ? "bg-acc-soft text-acc" : "bg-card-3 text-txt-3",
            )}
          >
            {instances.length}
            <Icon name="chevron-down" size={9} strokeWidth={2.6} className={cn("size-[9px] [flex:0_0_9px]", "transition-transform duration-[140ms]", expanded && "rotate-180")} />
          </button>
        )}

        {onTogglePin && (
          <PinButton pinned={pinned} onToggle={(e) => { e.stopPropagation(); onTogglePin(); }} />
        )}
        <Tooltip content={t("sidebar.spawn_instance_title")} side="top" className={HOVER_ACTION}>
          <RosterActionButton
            onClick={(e) => { e.stopPropagation(); onSpawn(agent.id); }}
            aria-label={t("sidebar.spawn_instance_aria", { name: agent.name })}
          >
            <Icon name="plus" size={11} className="size-[11px] [flex:0_0_11px]" strokeWidth={2.2} />
          </RosterActionButton>
        </Tooltip>
        {!isMulti && inst && (
          <Tooltip content={t("sidebar.remove_from_project_title")} side="top" className={HOVER_ACTION}>
            <RosterActionButton
              tone="danger"
              onClick={(e) => { e.stopPropagation(); onRemove(inst.instanceId); }}
              aria-label={t("sidebar.remove_from_project_aria", { name: agent.name })}
            >
              <Icon name="x" size={10} className="size-[10px] [flex:0_0_10px]" strokeWidth={2.2} />
            </RosterActionButton>
          </Tooltip>
        )}
      </div>
  );

  return (
    <div>
      {/* Agent row */}
      {quickViewSubject ? (
        <AgentQuickView
          subject={quickViewSubject}
          spendByInstance={spendByInstance}
          onSelect={onSelect}
          onSpawn={onSpawn}
        >
          {renderAgentRow}
        </AgentQuickView>
      ) : (
        renderAgentRow()
      )}

      {/* Expanded sessions tree */}
      {isMulti && expanded && (
        <div className="flex flex-col gap-[1px] mt-[2px] mb-[4px] ml-[15px] pl-[14px] border-l border-edge">
          {instances.map((inst, idx) => {
            const spendKey = `${inst.agentId}|${inst.instanceId}`;
            const instSpend = spendByInstance[spendKey] ?? 0;
            return (
              <RosterInstanceRow
                key={inst.instanceId}
                agent={agent}
                instance={inst}
                instanceId={inst.instanceId}
                instanceNumber={idx + 1}
                label={inst.label}
                status={instanceStatuses[idx] ?? "idle"}
                isSelected={selectedInstanceId === inst.instanceId}
                onSelect={() => onSelect(inst.instanceId)}
                onSpawn={onSpawn}
                onRemove={() => onRemove(inst.instanceId)}
                onRename={() => onRenameStart(inst.instanceId)}
                isRenaming={renamingInstanceId === inst.instanceId}
                onRenameCommit={(label) => onRenameCommit(inst.instanceId, label)}
                onRenameCancel={onRenameCancel}
                spend={instSpend > 0 ? instSpend : undefined}
              />
            );
          })}
          <RosterSessionRow
            onClick={() => onSpawn(agent.id)}
            aria-label={t("sidebar.spawn_instance_aria", { name: agent.name })}
            className="gap-[7px] text-txt-4 hover:bg-transparent hover:text-acc"
          >
            <Icon name="plus" size={10} className="size-[10px] [flex:0_0_10px]" strokeWidth={2.4} />
            <span className="text-[11px] font-semibold whitespace-nowrap">{t("sidebar.new_session")}</span>
          </RosterSessionRow>
        </div>
      )}
    </div>
  );
}
