"use client";

import { useTranslations } from "next-intl";
import type { HealthInfo } from "@agent-office/domain/types";

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
      <h3 className="font-semibold m-0 mb-[6px] text-[15px]">{t("first_run.requirements_title")}</h3>
      <p className="text-txt-3 m-0 mb-[12px] text-[12.5px] leading-[1.5]">{t("first_run.requirements_hint")}</p>
      <div className="flex flex-col gap-2.5 mt-4">
        <ReqRow
          label={t("first_run.req_claude_label")}
          status={status}
          okText={t("first_run.req_claude_ok", { version: health?.version ?? "" })}
          checkingText={t("first_run.req_claude_checking")}
          errorText={t("first_run.req_claude_missing")}
        />
        {!loading && !health?.available ? (
          <div className="text-txt-3 m-0 mb-[12px] text-[11.5px] leading-[1.5] mt-[6px] mb-0 pl-7">
            <div>{t("first_run.req_claude_install")}</div>
            <div className="mt-1">{t("first_run.req_claude_auth_note")}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ReqRow({ label, status, okText, checkingText, errorText }: {
  label: string;
  status: "checking" | "ok" | "error";
  okText: string;
  checkingText: string;
  errorText: string;
}) {
  const badge = status === "ok" ? "✓" : status === "error" ? "✗" : "…";
  const badgeColor = status === "ok"
    ? "var(--success, #22c55e)"
    : status === "error"
      ? "var(--error)"
      : "var(--txt-3)";
  const detail = status === "ok" ? okText : status === "error" ? errorText : checkingText;
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span aria-hidden className="font-bold text-[15px] w-4 text-center shrink-0" style={{ color: badgeColor }}>
        {badge}
      </span>
      <span className="font-semibold min-w-[90px]">{label}</span>
      <span className="text-txt-2 font-mono text-[12px]">{detail}</span>
    </div>
  );
}
