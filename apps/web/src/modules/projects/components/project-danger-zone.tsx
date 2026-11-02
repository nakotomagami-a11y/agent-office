"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { WorkChoice } from "@agent-office/domain/config/sessions";
import { Icon, type IconName } from "@/components/ui/icon";
import { ModalShell } from "@/components/ui/modal-shell";
import { Tooltip } from "@/components/ui/tooltip";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { useAgentUnits } from "@/modules/runs/hooks/use-agent-units";
import { cn } from "@/lib/cn";
import type { SessionConflict } from "@/lib/api/roster";
import { sessionConflictLead, sessionStakes } from "./remove-session-modal";

export type PendingDangerAction = "reset" | "delete" | null;

export type ProjectDangerZoneProps = {
  projectName: string;
  /** One agent id per roster session, in roster order (the reset dialog's avatar stack). */
  sessionAgentIds: string[];
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

const STACK_MAX = 6;

/** The page's last row: reset the roster or delete the project, each behind its own confirmation dialog. */
export function ProjectDangerZone(props: ProjectDangerZoneProps) {
  const { sessionAgentIds, pending, working, onRequest, onCancel } = props;
  const t = useTranslations("project_detail");
  const close = () => {
    if (!working) onCancel();
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-[12px] pt-[18px] px-[4px] pb-[4px] mt-[8px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/danger-x.png" alt="" width={30} height={30} className="shrink-0 object-contain" />
        <div className="flex flex-col gap-[2px] min-w-0">
          <span className="text-[14px] font-bold text-red whitespace-nowrap">{t("danger_title")}</span>
          <span className="text-[11.5px] text-txt-4 whitespace-nowrap">{t("danger_sub")}</span>
        </div>
        <span className="flex-1" />
        <Tooltip content={t(sessionAgentIds.length === 0 ? "reset_tooltip_empty" : "reset_tooltip")} className={cn("shrink-0", sessionAgentIds.length === 0 && "cursor-not-allowed")}>
        <button
          type="button"
          onClick={() => onRequest("reset")}
          disabled={sessionAgentIds.length === 0}
          className={cn(
            ROW_BTN,
            "border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-transparent text-red transition-all duration-150 hover:bg-red-soft hover:border-red disabled:pointer-events-none",
          )}
        >
          <Icon name="refresh" size={13} />
          {t("reset_title")}
        </button>
        </Tooltip>
        <Tooltip content={t("delete_tooltip")} className="shrink-0">
        <button
          type="button"
          onClick={() => onRequest("delete")}
          className={cn(ROW_BTN, "border-none bg-red text-white transition-[filter] duration-150 hover:brightness-110")}
        >
          <Icon name="trash" size={13} />
          {t("delete_title")}
        </button>
        </Tooltip>
      </div>

      {pending === "reset" && <ResetRosterDialog {...props} close={close} />}
      {pending === "delete" && <DeleteProjectDialog {...props} close={close} />}
    </>
  );
}

const ROW_BTN =
  "h-[32px] px-[14px] flex items-center gap-[7px] rounded-[10px] font-[inherit] text-[12.5px] font-semibold cursor-pointer whitespace-nowrap shrink-0 " +
  "disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-acc focus-visible:outline-offset-2";

type DialogProps = ProjectDangerZoneProps & { close: () => void };

function ResetRosterDialog({ projectName, sessionAgentIds, working, conflict, error, onConfirm, close }: DialogProps) {
  const t = useTranslations("project_detail");
  const tr = useTranslations("session_removal");
  const unitByAgent = useAgentUnits();
  const [choice, setChoice] = useState<WorkChoice>("keep");
  const count = sessionAgentIds.length;
  const choosing = conflict?.code === "session_has_work";
  const confirm = () => {
    if (!working) onConfirm(choosing ? choice : undefined);
  };
  const unitOf = (agentId: string) => unitByAgent.get(agentId) ?? unitForAgent(agentId);
  const more = count - STACK_MAX;

  const primary: { label: string; icon: IconName } = !choosing
    ? { label: t("reset_confirm"), icon: "refresh" }
    : choice === "discard"
      ? { label: t("danger_discard"), icon: "trash" }
      : { label: t("danger_keep"), icon: "check" };

  return (
    <DangerDialog
      width={540}
      icon="refresh"
      title={t("reset_title")}
      sub={t("reset_sub", { project: projectName, count })}
      close={close}
      onEnter={choosing ? undefined : confirm}
      error={error ? t("reset_failed", { error }) : null}
      hint={choosing ? t("reset_choice_hint") : t("reset_hint")}
      primary={
        <PrimaryButton onClick={confirm} busy={working} icon={primary.icon}>
          {working ? "…" : primary.label}
        </PrimaryButton>
      }
    >
      {!conflict ? (
        <div className="flex flex-col gap-[16px]">
          <div className="flex items-center gap-[12px] px-[14px] py-[12px] rounded-[14px] bg-card-2 border border-edge shadow-[var(--inset-hi)]">
            <div className="flex items-center shrink-0">
              {sessionAgentIds.slice(0, STACK_MAX).map((agentId, i) => (
                <AgentAvatar
                  key={i}
                  unit={unitOf(agentId)}
                  size={30}
                  className={cn("rounded-full border-2 border-card-2 bg-card-3 object-cover", i > 0 && "-ml-[9px]")}
                />
              ))}
              {more > 0 && (
                <span className="flex items-center justify-center w-[30px] h-[30px] rounded-full bg-card-3 border-2 border-card-2 -ml-[9px] text-[10.5px] font-bold text-txt-3">
                  +{more}
                </span>
              )}
            </div>
            <span className="text-[12.5px] text-txt-2">{t("reset_leave", { count })}</span>
          </div>
          <p className="m-0 text-[13px] leading-[1.6] text-txt-2 [text-wrap:pretty]">{t("reset_detail", { count })}</p>
        </div>
      ) : (
        <div role="alert" className="flex flex-col gap-[12px] motion-safe:animate-[lrIn_260ms_cubic-bezier(.2,.8,.2,1)_both]">
          <p className="m-0 text-[13px] leading-[1.55] text-txt font-semibold">{sessionConflictLead(tr, conflict)}</p>
          {conflict.sessions.length > 0 && (
            <div className="flex flex-col rounded-[14px] bg-card-2 border border-edge overflow-hidden">
              {conflict.sessions.map((s, i) => {
                const stakes = choosing ? sessionStakes(tr, s) : "";
                return (
                  <div key={s.instanceId} className={cn("flex items-center gap-[11px] px-[12px] py-[10px]", i > 0 && "border-t border-edge")}>
                    <AgentAvatar unit={unitOf(s.agentId)} size={28} className="rounded-none object-contain" />
                    <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                      <span className="flex items-baseline gap-[7px] min-w-0">
                        <span className="text-[12.5px] font-bold whitespace-nowrap">{s.label ?? s.instanceId}</span>
                        {s.branch && (
                          <span className="font-mono text-[10.5px] text-txt-3 whitespace-nowrap overflow-hidden text-ellipsis">{s.branch}</span>
                        )}
                      </span>
                      {stakes && <span className="text-[11.5px] text-amber">{stakes}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {choosing && (
            <div role="radiogroup" aria-label={t("reset_choice_hint")} className="flex gap-[8px]">
              <WorkChoiceCard on={choice === "keep"} onPick={() => setChoice("keep")} title={t("danger_keep")} text={tr("keep_explainer")} />
              <WorkChoiceCard on={choice === "discard"} onPick={() => setChoice("discard")} title={t("danger_discard")} text={tr("discard_explainer")} red />
            </div>
          )}
          {conflict.detail && <p className="m-0 font-mono text-[11px] text-txt-4 break-words">{conflict.detail}</p>}
        </div>
      )}
    </DangerDialog>
  );
}

function WorkChoiceCard({ on, onPick, title, text, red = false }: { on: boolean; onPick: () => void; title: string; text: string; red?: boolean }) {
  const ring = on ? (red ? "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--red)_45%,transparent)]" : "shadow-[inset_0_0_0_1px_var(--edge-2)]") : "shadow-[inset_0_0_0_1px_var(--edge)]";
  const radio = on ? (red ? "shadow-[inset_0_0_0_4px_var(--red)]" : "shadow-[inset_0_0_0_4px_var(--acc)]") : "shadow-[inset_0_0_0_1.5px_var(--edge-2)]";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={cn(
        "flex-1 basis-0 min-w-0 flex flex-col gap-[6px] p-[12px] rounded-[13px] border-none text-left font-[inherit] cursor-pointer [transition:background-color_160ms_ease,box-shadow_160ms_ease] hover:bg-card-3 focus-visible:outline-2 focus-visible:outline-acc focus-visible:outline-offset-2",
        on ? (red ? "bg-red-soft" : "bg-card-3") : "bg-card-2",
        ring,
      )}
    >
      <span className={cn("flex items-center gap-[8px] text-[12.5px] font-bold", red && on ? "text-red" : "text-txt")}>
        <span className={cn("w-[14px] h-[14px] rounded-full shrink-0 transition-shadow duration-[160ms]", radio)} />
        {title}
      </span>
      <span className="text-[11.5px] leading-[1.5] text-txt-3 [text-wrap:pretty]">{text}</span>
    </button>
  );
}

function DeleteProjectDialog({ projectName, cwdOrName, working, error, onConfirm, close }: DialogProps) {
  const t = useTranslations("project_detail");
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === projectName;
  const confirm = () => {
    if (matches && !working) onConfirm();
  };

  return (
    <DangerDialog
      width={500}
      icon="trash"
      title={t("delete_title")}
      sub={cwdOrName}
      close={close}
      error={error ? t("delete_failed", { error }) : null}
      hint={t("delete_hint")}
      primary={
        <PrimaryButton onClick={confirm} busy={working} disabled={!matches} icon="trash">
          {working ? t("delete_working") : t("delete_confirm")}
        </PrimaryButton>
      }
    >
      <p className="m-0 text-[13px] leading-[1.6] text-txt-2 [text-wrap:pretty]">{t("delete_detail", { path: cwdOrName })}</p>
      <label className="flex flex-col gap-[7px]">
        <span className="text-[12px] text-txt-3">
          {t.rich("delete_type_confirm", {
            project: projectName,
            name: (chunks) => <span className="font-mono font-bold text-txt">{chunks}</span>,
          })}
        </span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches) {
              e.preventDefault();
              confirm();
            }
          }}
          autoFocus
          placeholder={projectName}
          spellCheck={false}
          autoComplete="off"
          className={cn(
            "h-[38px] px-[12px] rounded-[11px] bg-card-2 border shadow-[var(--inset-hi)] text-txt font-mono text-[12.5px] outline-none [transition:border-color_160ms_ease]",
            matches ? "border-[color-mix(in_srgb,var(--red)_55%,transparent)]" : "border-edge focus:border-edge-2",
          )}
        />
      </label>
    </DangerDialog>
  );
}

function DangerDialog({
  width,
  icon,
  title,
  sub,
  close,
  onEnter,
  error,
  hint,
  primary,
  children,
}: {
  width: number;
  icon: IconName;
  title: string;
  sub: string;
  close: () => void;
  onEnter?: () => void;
  error: string | null;
  hint: string;
  primary: ReactNode;
  children: ReactNode;
}) {
  const tc = useTranslations("common");
  return (
    <ModalShell
      open
      onClose={close}
      onEnter={onEnter}
      ariaLabel={title}
      bareContent
      maxWidth={width}
      className="rounded-[22px] overflow-hidden shadow-[var(--lift),0_40px_100px_-30px_rgba(0,0,0,.95)] motion-safe:animate-[lrIn_260ms_cubic-bezier(.2,.8,.2,1)_both]"
    >
      <div className="flex items-start gap-[14px] pt-[20px] pr-[20px] pl-[22px] shrink-0">
        <span className="w-[40px] h-[40px] rounded-[12px] flex items-center justify-center shrink-0 bg-red-soft text-red shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--red)_25%,transparent)]">
          <Icon name={icon} size={18} />
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-[3px] pt-[2px]">
          <span className="text-[17px] font-extrabold tracking-[-0.02em]">{title}</span>
          <span className="font-mono text-[11px] text-txt-4 overflow-hidden text-ellipsis whitespace-nowrap" title={sub}>{sub}</span>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={tc("close")}
          className="w-[30px] h-[30px] shrink-0 flex items-center justify-center border-none rounded-[9px] bg-transparent text-txt-4 cursor-pointer transition-colors duration-150 hover:bg-card-3 hover:text-txt focus-visible:outline-2 focus-visible:outline-acc"
        >
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[16px] px-[22px] pt-[16px] pb-[20px]">
        {children}
        {error && (
          <p role="alert" className="m-0 flex items-start gap-[7px] px-[12px] py-[10px] rounded-[11px] bg-red-soft text-[12px] leading-[1.5] text-red break-words">
            <Icon name="alert-circle" size={13} className="shrink-0 mt-[2px]" />
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center gap-[8px] pt-[14px] pb-[14px] pr-[20px] pl-[22px] border-t border-edge bg-[var(--ao-gutter)] shrink-0">
        <span className="font-mono text-[10.5px] text-txt-4">{hint}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={close}
          className="h-[34px] px-[14px] flex items-center gap-[7px] rounded-[10px] border border-edge-2 bg-transparent text-txt-2 font-[inherit] text-[12.5px] font-semibold cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-txt hover:border-txt-4 focus-visible:outline-2 focus-visible:outline-acc focus-visible:outline-offset-2"
        >
          {tc("cancel")}
        </button>
        {primary}
      </div>
    </ModalShell>
  );
}

function PrimaryButton({
  onClick,
  busy,
  disabled = false,
  icon,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  disabled?: boolean;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "h-[34px] px-[16px] flex items-center gap-[7px] rounded-[10px] border-none bg-red text-white font-[inherit] text-[12.5px] font-bold cursor-pointer whitespace-nowrap shadow-[0_12px_26px_-14px_rgba(248,113,113,.9)] [transition:filter_160ms_ease,opacity_160ms_ease] enabled:hover:brightness-[1.08] focus-visible:outline-2 focus-visible:outline-acc focus-visible:outline-offset-2",
        disabled ? "disabled:opacity-45 disabled:cursor-not-allowed" : "disabled:opacity-60 disabled:cursor-progress",
      )}
    >
      <Icon name={icon} size={13} />
      {children}
    </button>
  );
}
