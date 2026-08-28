"use client";

import { Icon } from "@/components/ui/icon";

export type PendingDangerAction = "reset" | "delete" | null;

export type ProjectDangerZoneProps = {
  rosterCount: number;
  cwdOrName: string;
  pending: PendingDangerAction;
  working: boolean;
  onRequest: (action: "reset" | "delete") => void;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Destructive-actions card. Styling matches the V3 mock's red-tinted frame;
 * the reset/delete round-trip itself is unchanged real behavior.
 */
export function ProjectDangerZone({
  rosterCount,
  cwdOrName,
  pending,
  working,
  onRequest,
  onCancel,
  onConfirm,
}: ProjectDangerZoneProps) {
  return (
    <div
      className="rounded-[24px] shadow-[var(--lift)] overflow-hidden"
      style={{ border: "1px solid rgba(239,68,68,.28)" }}
    >
      <div
        className="flex items-center gap-[11px] px-[22px] py-[16px]"
        style={{ borderBottom: "1px solid rgba(239,68,68,.18)" }}
      >
        <span className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center shrink-0 bg-red-soft text-red">
          <Icon name="shield" size={15} />
        </span>
        <div>
          <div className="text-[15px] font-bold text-red whitespace-nowrap">Danger zone</div>
          <div className="text-[11px] text-txt-4 whitespace-nowrap">destructive actions — they cannot be undone</div>
        </div>
      </div>

      <DangerRow
        title="Reset roster"
        detail={`remove all ${rosterCount} agents from the office — definitions stay in ~/.claude/agents/`}
        actionLabel="Reset roster"
        icon="refresh"
        pending={pending === "reset"}
        working={working}
        disabled={rosterCount === 0}
        onRequest={() => onRequest("reset")}
        onCancel={onCancel}
        onConfirm={onConfirm}
        confirmingLabel="Reset"
        borderBottom
      />
      <DangerRow
        title="Delete project"
        detail={`remove the workspace entry and all conversation history — files at ${cwdOrName} stay untouched`}
        actionLabel="Delete project"
        icon="trash"
        pending={pending === "delete"}
        working={working}
        onRequest={() => onRequest("delete")}
        onCancel={onCancel}
        onConfirm={onConfirm}
        confirmingLabel="Delete"
        solid
      />
    </div>
  );
}

function DangerRow({
  title,
  detail,
  actionLabel,
  icon,
  pending,
  working,
  disabled,
  onRequest,
  onCancel,
  onConfirm,
  confirmingLabel,
  solid = false,
  borderBottom = false,
}: {
  title: string;
  detail: string;
  actionLabel: string;
  icon: "refresh" | "trash";
  pending: boolean;
  working: boolean;
  disabled?: boolean;
  onRequest: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirmingLabel: string;
  /** Delete uses a filled red button; Reset uses an outlined one. */
  solid?: boolean;
  borderBottom?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-[16px] px-[22px] py-[16px]"
      style={borderBottom ? { borderBottom: "1px solid var(--edge)" } : undefined}
    >
      <div className="flex-1">
        <div className="text-[13.5px] font-semibold whitespace-nowrap">{title}</div>
        <div className="font-mono text-[10.5px] text-txt-4 mt-[3px]">{detail}</div>
      </div>
      {pending ? (
        <div className="flex items-center gap-[8px] shrink-0">
          <span className="text-[12px] text-txt-3 whitespace-nowrap">Are you sure?</span>
          <button
            type="button"
            onClick={onCancel}
            disabled={working}
            className="px-[12px] py-[7px] rounded-[9px] bg-transparent border border-edge-2 text-txt-2 text-[12px] font-semibold cursor-pointer whitespace-nowrap hover:text-txt disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={working}
            className="px-[12px] py-[7px] rounded-[9px] border-none bg-red text-white text-[12px] font-semibold cursor-pointer whitespace-nowrap hover:brightness-110 disabled:opacity-60"
          >
            {working ? "…" : confirmingLabel}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onRequest}
          disabled={disabled}
          className={
            solid
              ? "flex items-center gap-[7px] px-[15px] py-[8px] rounded-[10px] border-none bg-red text-white text-[12.5px] font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-[filter] duration-150 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              : "flex items-center gap-[7px] px-[15px] py-[8px] rounded-[10px] bg-transparent text-red text-[12.5px] font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-red hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          }
          style={solid ? undefined : { border: "1px solid rgba(239,68,68,.3)" }}
        >
          <Icon name={icon} size={13} /> {actionLabel}
        </button>
      )}
    </div>
  );
}
