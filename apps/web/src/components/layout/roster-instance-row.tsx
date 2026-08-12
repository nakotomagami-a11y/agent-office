"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import type { AgentStatusInfo } from "@/modules/office/derive/derive-status";

export interface RosterInstanceRowProps {
  instanceId: string;
  instanceNumber: number;
  label?: string;
  status: AgentStatusInfo["status"];
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRename: () => void;
  isRenaming: boolean;
  onRenameCommit: (label: string) => void;
  onRenameCancel: () => void;
  spend?: number;
}

const LIVE: AgentStatusInfo["status"][] = ["working", "thinking"];

export function RosterInstanceRow({
  instanceId,
  instanceNumber,
  label,
  status,
  isSelected,
  onSelect,
  onRemove,
  onRename,
  isRenaming,
  onRenameCommit,
  onRenameCancel,
  spend,
}: RosterInstanceRowProps) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const displayLabel = label || `Session ${instanceNumber}`;
  const isLive = LIVE.includes(status);

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
      <div className="ses">
        <input
          ref={inputRef}
          type="text"
          defaultValue={label ?? ""}
          onKeyDown={handleKeyDown}
          onBlur={() => onRenameCommit(inputRef.current?.value.trim() ?? "")}
          placeholder={`Session ${instanceNumber}`}
          aria-label={t("sidebar.rename_instance_aria", { number: instanceNumber })}
          onClick={(e) => e.stopPropagation()}
          className="[grid-column:1/-1] bg-bg-1 border border-line-2 rounded-[4px] px-[6px] py-[2px] text-[12px] text-txt outline-none focus:border-acc"
        />
      </div>
    );
  }

  return (
    <div
      className={cn("ses", isSelected && "ses-active")}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}
    >
      {/* Session name */}
      <span className={cn(
        "text-[13px] overflow-hidden text-ellipsis whitespace-nowrap",
        isSelected ? "font-semibold text-txt" : "font-medium text-txt-2",
      )}>
        {displayLabel}
      </span>

      {/* Cost */}
      <span className={cn(
        "font-[var(--font-mono)] text-[10.5px] tracking-[0.02em]",
        isSelected ? "text-acc" : "text-txt-3",
      )}>
        {spend !== undefined ? `$${spend.toFixed(2)}` : ""}
      </span>

      {/* LED dot */}
      <span className={cn(
        "w-[6px] h-[6px] rounded-full shrink-0",
        isLive ? "bg-[var(--working)] shadow-[0_0_4px_var(--working)]" : "bg-txt-4",
      )} />

      {/* Hover actions — absolutely positioned via ses-actions CSS */}
      <div className="ses-actions">
        <Tooltip content="Rename" side="top" delayMs={300}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRename(); }}
            aria-label={`Rename session ${instanceNumber}`}
            data-instance-id={instanceId}
          >
            <Icon name="edit" size={11} />
          </button>
        </Tooltip>
        <Tooltip content={t("sidebar.remove_from_project_title")} side="top" delayMs={300}>
          <button
            type="button"
            className="danger"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            aria-label={t("sidebar.remove_instance_aria", { number: instanceNumber, label: label ?? "" })}
            data-instance-id={instanceId}
          >
            <Icon name="x" size={11} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
