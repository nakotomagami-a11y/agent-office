"use client";

import { useTranslations } from "next-intl";
import type { HealthInfo } from "@agent-office/domain/types";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export type RequirementsStepProps = {
  health: HealthInfo | undefined;
  loading: boolean;
};

/**
 * Wizard step 1: display Claude Code health check status and prerequisites.
 * Blocks progression until `health.available === true`.
 */
export function RequirementsStep({ health, loading }: RequirementsStepProps) {
  const t = useTranslations();
  const status = loading ? "checking" : health?.available ? "ok" : "error";

  return (
    <section>
      <h3 className="m-0 text-[16.5px] font-extrabold tracking-[-0.025em]">
        {t("first_run.requirements_title")}
      </h3>
      <p className="m-0 mt-[6px] max-w-[560px] text-[12.5px] leading-[1.6] text-txt-3 text-pretty">
        {t("first_run.requirements_hint")}
      </p>

      <div className="mt-[18px] flex items-center gap-[13px] rounded-2xl border border-edge bg-card px-[14px] py-[12px]">
        <span
          className={cn(
            "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl",
            status === "ok" && "bg-green-soft text-green",
            status === "error" && "bg-red-soft text-red",
            status === "checking" && "bg-card-2 text-txt-3",
          )}
        >
          <Icon
            name={status === "ok" ? "check" : status === "error" ? "x" : "refresh"}
            size={16}
            className={status === "checking" ? "animate-spin" : undefined}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold">{t("first_run.req_claude_label")}</div>
          <div className="mt-[2px] truncate font-mono text-[11px] text-txt-4">
            {status === "ok"
              ? t("first_run.req_claude_ok", { version: health?.version ?? "" })
              : status === "error"
                ? t("first_run.req_claude_missing")
                : t("first_run.req_claude_checking")}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.06em]",
            status === "ok" && "text-green",
            status === "error" && "text-red",
            status === "checking" && "text-txt-4",
          )}
        >
          {status === "ok"
            ? t("first_run.req_claude_ready")
            : status === "error"
              ? t("first_run.req_claude_blocked")
              : t("first_run.req_claude_checking")}
        </span>
      </div>

      {status === "error" ? (
        <div className="mt-[10px] pl-1 text-[11.5px] leading-[1.6] text-txt-3">
          <div>{t("first_run.req_claude_install")}</div>
          <div className="mt-1">{t("first_run.req_claude_auth_note")}</div>
        </div>
      ) : null}

      <div className="mt-[14px] rounded-2xl border border-edge bg-card-2 px-4 py-[13px]">
        <div className="text-[12.5px] font-bold">{t("first_run.what_runs_where_title")}</div>
        <p className="m-0 mt-[6px] text-[11.5px] leading-[1.6] text-txt-3 text-pretty">
          {t("first_run.what_runs_where_body")}
        </p>
      </div>
    </section>
  );
}
