"use client";

import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { agentDisplayName } from "@/lib/agent-display-name";
import { RosterInstanceRow } from "./roster-instance-row";
import { RosterActionButton, RosterSessionRow } from "./roster-row-controls";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import type { AgentInstance } from "@agent-office/domain/types";
import type { AgentStatusInfo } from "@/modules/office/derive/derive-status";
import {
  AGENT_DRAG_MIME,
  useOfficeDragStore,
  type DragRef,
} from "@/modules/office/hooks/use-office-drag";

const LIVE: AgentStatusInfo["status"][] = ["working", "thinking"];

function agentLedClass(status: AgentStatusInfo["status"]) {
  return cn(
    "absolute -bottom-[2px] -right-[2px] w-[8px] h-[8px] rounded-full border-[2px] border-bg-2",
    LIVE.includes(status) && "bg-[var(--working)] shadow-[0_0_5px_var(--working)]",
    (status === "queued" || status === "done") && "bg-[#e6b35a]",
    status === "error" && "bg-[var(--error)]",
    !LIVE.includes(status) && status !== "queued" && status !== "done" && status !== "error" && "bg-txt-4",
  );
}

const STATUS_PRIORITY: AgentStatusInfo["status"][] = [
  "idle", "done", "queued", "thinking", "working", "error",
];

function PinButton({ pinned, onToggle }: { pinned: boolean; onToggle: (e: React.MouseEvent) => void }) {
  return (
    <Tooltip content={pinned ? "Unpin" : "Pin to top"} side="top">
      <RosterActionButton
        active={pinned}
        onClick={onToggle}
        aria-label={pinned ? "Unpin agent" : "Pin agent to top"}
        className={!pinned ? "opacity-0 group-hover:opacity-100" : undefined}
      >
        <Icon name="pin" size={11} />
      </RosterActionButton>
    </Tooltip>
  );
}

function aggregateStatus(statuses: AgentStatusInfo["status"][]): AgentStatusInfo["status"] {
  let best: AgentStatusInfo["status"] = "idle";
  for (const s of statuses) {
    if (STATUS_PRIORITY.indexOf(s) > STATUS_PRIORITY.indexOf(best)) best = s;
  }
  return best;
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
  const setDragging = useOfficeDragStore((s) => s.setDragging);

  const inst = instances[0];
  const singleStatus = instanceStatuses[0] ?? "idle";
  const aggregated = isMulti ? aggregateStatus(instanceStatuses) : singleStatus;
  const hasLive = instanceStatuses.some((s) => LIVE.includes(s));

  const dragRef: DragRef = isMulti || !inst
    ? { agentId: agent.id }
    : { agentId: agent.id, instanceId: inst.instanceId };

  const isSelected = !isMulti && inst ? selectedInstanceId === inst.instanceId : false;

  return (
    <div>
      {/* Agent row */}
      <div
        className={cn(
          "flex items-center gap-[10px] p-[6px] rounded-[8px] cursor-pointer hover:bg-bg-3 group relative",
          isSelected && "bg-acc-faint",
        )}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(AGENT_DRAG_MIME, JSON.stringify(dragRef));
          e.dataTransfer.setData("text/plain", agent.id);
          e.dataTransfer.effectAllowed = "move";
          setDragging(dragRef);
        }}
        onDragEnd={() => setDragging(null)}
        onClick={() => isMulti ? onToggle() : (inst && onSelect(inst.instanceId))}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ")
            isMulti ? onToggle() : (inst && onSelect(inst.instanceId));
        }}
        aria-expanded={isMulti ? expanded : undefined}
      >
        {/* Avatar + LED */}
        <div className="relative w-8 h-8 shrink-0">
          <AgentAvatar unit={agent.unitChoice} size={40} />
          <span className={agentLedClass(aggregated)} />
        </div>

        {/* Name */}
        <span className="flex-1 min-w-0 flex items-center gap-[6px] text-[14px] font-semibold text-txt overflow-hidden text-ellipsis whitespace-nowrap">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">{agentDisplayName(agent)}</span>
        </span>

        {/* Right section — multi mode only; count/chevron are permanent
            controls (not hover-only) so they stay in grid flow. */}
        <div className="flex items-center gap-[6px] text-txt-4">
          {isMulti && (
            <>
              {onTogglePin && (
                <PinButton pinned={pinned} onToggle={(e) => { e.stopPropagation(); onTogglePin(); }} />
              )}
              <span className={cn(
                "px-[7px] py-[1px] rounded-full font-[var(--font-mono)] text-[10.5px] font-bold tracking-[0.02em]",
                hasLive
                  ? "bg-acc-faint border border-acc-tint text-acc"
                  : "bg-bg-3 border border-line text-txt-3",
              )}>
                {instances.length}
              </span>
              <span className={cn(
                "w-[18px] h-[18px] flex items-center justify-center transition-transform duration-[160ms]",
                expanded ? "rotate-90 text-acc" : "text-txt-4",
              )}>
                <Icon name="chevron" size={11} />
              </span>
            </>
          )}
        </div>

        {/* Hover actions (single-instance mode) — the name owns the full row
            width and truncates with an ellipsis; these controls are absolutely
            positioned so they overlay the row's right edge on top of the name
            instead of reserving flow space and squeezing it. A left-to-right
            fade mask (row hover colour → transparent) sits behind them so a
            long, truncated name dissolves cleanly under the buttons rather
            than bleeding through the gaps. */}
        {!isMulti && (
          <>
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute right-0 top-0 bottom-0 w-[96px] rounded-r-[8px] z-[1]",
                "bg-gradient-to-l from-[var(--bg-3)] from-55% to-transparent",
                "opacity-0 transition-opacity duration-[120ms]",
                "group-hover:opacity-100",
              )}
            />
            <div className="absolute right-[6px] top-1/2 -translate-y-1/2 flex items-center gap-[3px] z-[2]">
              {onTogglePin && (
                <PinButton pinned={pinned} onToggle={(e) => { e.stopPropagation(); onTogglePin(); }} />
              )}
              <span className="flex gap-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-[120ms]">
                <Tooltip content={t("sidebar.spawn_instance_title")} side="top">
                  <RosterActionButton
                    onClick={(e) => { e.stopPropagation(); onSpawn(agent.id); }}
                    aria-label={t("sidebar.spawn_instance_aria", { name: agent.name })}
                  >
                    <Icon name="plus" size={12} />
                  </RosterActionButton>
                </Tooltip>
                {inst && (
                  <Tooltip content={t("sidebar.remove_from_project_title")} side="top">
                    <RosterActionButton
                      tone="danger"
                      onClick={(e) => { e.stopPropagation(); onRemove(inst.instanceId); }}
                      aria-label={t("sidebar.remove_from_project_aria", { name: agent.name })}
                    >
                      <Icon name="x" size={12} />
                    </RosterActionButton>
                  </Tooltip>
                )}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Expanded sessions tree */}
      {isMulti && expanded && (
        <div className="relative ml-[22px] pl-[14px] pt-[2px] pb-[6px] before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-[6px] before:w-px before:bg-line-2">
          {instances.map((inst, idx) => {
            const spendKey = `${inst.agentId}|${inst.instanceId}`;
            const instSpend = spendByInstance[spendKey] ?? 0;
            return (
              <RosterInstanceRow
                key={inst.instanceId}
                instanceId={inst.instanceId}
                instanceNumber={idx + 1}
                label={inst.label}
                status={instanceStatuses[idx] ?? "idle"}
                isSelected={selectedInstanceId === inst.instanceId}
                onSelect={() => onSelect(inst.instanceId)}
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
            className="text-txt-3 font-[var(--font-mono)] text-[11px] hover:bg-transparent hover:text-acc"
          >
            <Icon name="plus" size={11} />
            New session
          </RosterSessionRow>
        </div>
      )}
    </div>
  );
}
