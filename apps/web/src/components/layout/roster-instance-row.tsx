"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import type { AgentStatusInfo } from "@/modules/office/derive/derive-status";
import { LIVE_STATUSES, RosterSessionActionButton, RosterSessionActions, RosterSessionRow } from "./roster-row-controls";
import { AgentQuickView } from "./agent-quick-view";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import type { AgentInstance } from "@agent-office/domain/types";

export interface RosterInstanceRowProps {
  /** Owning agent + the full instance record — needed only to drive the
   *  hover quick-view card (see `agent-quick-view.tsx`); every other prop
   *  below is the row's own already-derived display data. */
  agent: OfficeAgent;
  instance: AgentInstance;
  instanceId: string;
  instanceNumber: number;
  label?: string;
  status: AgentStatusInfo["status"];
  isSelected: boolean;
  onSelect: () => void;
  onSpawn: (agentId: string) => void;
  onRemove: () => void;
  onRename: () => void;
  isRenaming: boolean;
  onRenameCommit: (label: string) => void;
  onRenameCancel: () => void;
  spend?: number;
}

export function RosterInstanceRow({
  agent,
  instance,
  instanceId,
  instanceNumber,
  label,
  status,
  isSelected,
  onSelect,
  onSpawn,
  onRemove,
  onRename,
  isRenaming,
  onRenameCommit,
  onRenameCancel,
  spend,
}: RosterInstanceRowProps) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const displayLabel = label || t("sidebar.session_default_label", { number: instanceNumber });
  const isLive = LIVE_STATUSES.includes(status);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onRenameCommit(inputRef.current?.value.trim() ?? "");
    else if (e.key === "Escape") onRenameCancel();
  };

  if (isRenaming) {
    return (
      <RosterSessionRow>
        <input
          ref={inputRef}
          type="text"
          defaultValue={label ?? ""}
          onKeyDown={handleKeyDown}
          onBlur={() => onRenameCommit(inputRef.current?.value.trim() ?? "")}
          placeholder={t("sidebar.session_default_label", { number: instanceNumber })}
          aria-label={t("sidebar.rename_instance_aria", { number: instanceNumber })}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-card-2 border border-edge-2 rounded-[6px] px-[6px] py-[2px] text-[11.5px] text-txt outline-none focus:border-acc"
        />
      </RosterSessionRow>
    );
  }

  return (
    <AgentQuickView
      subject={{ kind: "single", agent, instance, index: instanceNumber - 1, headerMode: "instance" }}
      spendByInstance={spend ? { [`${agent.id}|${instanceId}`]: spend } : {}}
      onSelect={() => onSelect()}
      onSpawn={onSpawn}
    >
      {(trigger) => (
        <RosterSessionRow
          ref={trigger.ref}
          active={isSelected}
          onClick={onSelect}
          onMouseEnter={trigger.onMouseEnter}
          onMouseLeave={trigger.onMouseLeave}
        >
          {/* Session name */}
          <span className={cn(
            "flex-1 min-w-0 text-[11.5px] overflow-hidden text-ellipsis whitespace-nowrap",
            isSelected ? "font-semibold text-txt" : "text-txt-2",
          )}>
            {displayLabel}
          </span>

          {/* Cost — fixed-width reserve so the LED dot lands in a straight
              column across rows regardless of whether a row has spend to show. */}
          <span className={cn(
            "w-[44px] shrink-0 text-right font-[var(--font-mono)] text-[10px] whitespace-nowrap",
            isSelected ? "text-acc" : "text-txt-4",
          )}>
            {spend !== undefined ? `$${spend.toFixed(2)}` : ""}
          </span>

          {/* LED dot */}
          <span className={cn(
            "w-[5px] h-[5px] rounded-full shrink-0",
            isLive ? "bg-green" : "bg-txt-4",
          )} />

          <RosterSessionActions>
            <Tooltip content={t("sidebar.rename_button_title")} side="top" delayMs={300}>
              <RosterSessionActionButton
                onClick={(e) => { e.stopPropagation(); onRename(); }}
                aria-label={t("sidebar.rename_button_aria", { number: instanceNumber })}
                data-instance-id={instanceId}
              >
                <Icon name="edit" size={11} className="size-[11px] [flex:0_0_11px]" />
              </RosterSessionActionButton>
            </Tooltip>
            <Tooltip content={t("sidebar.remove_from_project_title")} side="top" delayMs={300}>
              <RosterSessionActionButton
                danger
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                aria-label={t("sidebar.remove_instance_aria", { number: instanceNumber, label: label ?? "" })}
                data-instance-id={instanceId}
              >
                <Icon name="x" size={11} className="size-[11px] [flex:0_0_11px]" />
              </RosterSessionActionButton>
            </Tooltip>
          </RosterSessionActions>
        </RosterSessionRow>
      )}
    </AgentQuickView>
  );
}
