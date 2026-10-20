"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { WorkChoice } from "@agent-office/domain/config/sessions";
import { Icon } from "@/components/ui/icon";
import type { SessionConflict } from "@/lib/api/roster";
import { SessionConflictNotice } from "./remove-session-modal";

export type PendingDangerAction = "reset" | "delete" | null;

export type ProjectDangerZoneProps = {
  instanceCount: number;
  cwdOrName: string;
  pending: PendingDangerAction;
  working: boolean;
  /** A refused reset: running sessions, work to keep or discard, or worktrees git kept. */
  conflict: SessionConflict | null;
  error: string | null;
  onRequest: (action: "reset" | "delete") => void;
  onCancel: () => void;
  onConfirm: (work?: WorkChoice) => void;
};

/**
 * Destructive-actions card. Styling matches the V3 mock's red-tinted frame.
 */
export function ProjectDangerZone({
  instanceCount,
  cwdOrName,
  pending,
  working,
  conflict,
  error,
  onRequest,
  onCancel,
  onConfirm,
}: ProjectDangerZoneProps) {
  const t = useTranslations("project_detail");
  const choosing = conflict?.code === "session_has_work";
  const errorFor = (action: "reset" | "delete") =>
    pending === action && error ? t(action === "reset" ? "reset_failed" : "delete_failed", { error }) : null;

  return (
    <div
      className="rounded-[24px] shadow-[var(--lift)] overflow-hidden"
      style={{ border: "1px solid rgba(239,68,68,.28)" }}
    >
      <div
        className="flex items-center gap-[11px] px-[22px] py-[16px]"
        style={{ borderBottom: "1px solid rgba(239,68,68,.18)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/danger-x.png" alt="" width={30} height={30} className="shrink-0 object-contain" />
        <div>
          <div className="text-[15px] font-bold text-red whitespace-nowrap">{t("danger_title")}</div>
          <div className="text-[11px] text-txt-4 whitespace-nowrap">{t("danger_sub")}</div>
        </div>
      </div>

      <DangerRow
        title={t("reset_title")}
        detail={t("reset_detail", { count: instanceCount })}
        actionLabel={t("reset_title")}
        icon="refresh"
        pending={pending === "reset"}
        working={working}
        disabled={instanceCount === 0}
        onRequest={() => onRequest("reset")}
        onCancel={onCancel}
        onConfirm={() => onConfirm()}
        confirmingLabel={t("reset_confirm")}
        borderBottom
        hideConfirm={choosing}
      >
        {pending === "reset" && conflict && (
          <div className="flex flex-col gap-[10px]">
            <SessionConflictNotice conflict={conflict} />
            {choosing && (
              <div className="flex items-center gap-[8px]">
                <DangerButton onClick={onCancel} disabled={working} label={t("danger_cancel")} ghost />
                <DangerButton onClick={() => onConfirm("keep")} disabled={working} label={t("danger_keep")} ghost />
                <DangerButton onClick={() => onConfirm("discard")} disabled={working} label={t("danger_discard")} />
              </div>
            )}
          </div>
        )}
        {errorFor("reset") && <p className="m-0 text-[12px] text-red" role="alert">{errorFor("reset")}</p>}
      </DangerRow>
      <DangerRow
        title={t("delete_title")}
        detail={t("delete_detail", { path: cwdOrName })}
        actionLabel={t("delete_title")}
        icon="trash"
        pending={pending === "delete"}
        working={working}
        onRequest={() => onRequest("delete")}
        onCancel={onCancel}
        onConfirm={() => onConfirm()}
        confirmingLabel={t("delete_confirm")}
        solid
      >
        {errorFor("delete") && <p className="m-0 text-[12px] text-red" role="alert">{errorFor("delete")}</p>}
      </DangerRow>
    </div>
  );
}

function DangerButton({ onClick, disabled, label, ghost = false }: { onClick: () => void; disabled: boolean; label: string; ghost?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        ghost
          ? "px-[12px] py-[7px] rounded-[9px] bg-transparent border border-edge-2 text-txt-2 text-[12px] font-semibold cursor-pointer whitespace-nowrap hover:text-txt disabled:opacity-60"
          : "px-[12px] py-[7px] rounded-[9px] border-none bg-red text-white text-[12px] font-semibold cursor-pointer whitespace-nowrap hover:brightness-110 disabled:opacity-60"
      }
    >
      {label}
    </button>
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
  hideConfirm = false,
  children,
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
  /** The row's own children offer the choice instead. */
  hideConfirm?: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations("project_detail");
  return (
    <div
      className="flex flex-col gap-[10px] px-[22px] py-[16px]"
      style={borderBottom ? { borderBottom: "1px solid var(--edge)" } : undefined}
    >
      <div className="flex items-center gap-[16px]">
        <div className="flex-1">
          <div className="text-[13.5px] font-semibold whitespace-nowrap">{title}</div>
          <div className="font-mono text-[10.5px] text-txt-4 mt-[3px]">{detail}</div>
        </div>
        {pending ? (
          !hideConfirm && (
            <div className="flex items-center gap-[8px] shrink-0">
              <span className="text-[12px] text-txt-3 whitespace-nowrap">{t("danger_confirm_question")}</span>
              <DangerButton onClick={onCancel} disabled={working} label={t("danger_cancel")} ghost />
              <DangerButton onClick={onConfirm} disabled={working} label={working ? "…" : confirmingLabel} />
            </div>
          )
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
      {children}
    </div>
  );
}
