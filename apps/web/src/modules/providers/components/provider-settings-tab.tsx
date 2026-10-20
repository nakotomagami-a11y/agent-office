"use client";

import { useTranslations } from "next-intl";
import type { ProviderView } from "@agent-office/domain/types";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/cn";
import { requestBody } from "../format/provider-draft";
import { useProviderSetup } from "../hooks/use-provider-setup";
import { PriceSourceLine } from "./price-source";
import { ProviderSetupPanel } from "./provider-setup-panel";

function StatusPill({ view }: { view: ProviderView | undefined }) {
  const t = useTranslations("providers");
  const te = useTranslations("errors.provider");
  const status = view?.status;
  const state = !status ? "none" : status.available ? "ok" : "bad";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[7px] rounded-full border px-[12px] py-[6px] text-[11.5px] font-semibold whitespace-nowrap",
        state === "ok" && "border-transparent bg-green-soft text-green",
        state === "bad" && "border-transparent bg-red-soft text-red",
        state === "none" && "border-edge bg-card-2 text-txt-3",
      )}
    >
      <span className="h-[6px] w-[6px] rounded-full bg-current" aria-hidden />
      {state === "ok" ? t("pill_ready") : state === "bad" ? t("unavailable", { reason: status?.reason ? te(`${status.reason}.title`) : "" }) : t("pill_none")}
    </span>
  );
}

/** Settings → Credentials → AI provider. The same setup the wizard uses, saved by an explicit button. */
export function ProviderSettingsTab() {
  const t = useTranslations("providers");
  const setup = useProviderSetup();
  const { data, choice } = setup;
  const active = data?.providers.find((p) => p.id === data.selected);
  const switching = Boolean(data?.selected && choice && choice !== data.selected);
  const dirty = Boolean(choice) && (choice !== data?.selected || (choice !== "subscription" && requestBody(choice!, setup.draft, setup.view) !== null));

  return (
    <>
      <div className="flex flex-col gap-[16px] rounded-[22px] surface-sheen px-[22px] py-[20px] shadow-[var(--lift)]">
        <div className="flex flex-wrap items-start gap-[14px]">
          <div className="min-w-0 flex-1">
            <div className="text-[19px] font-extrabold tracking-[-0.025em]">{t("title")}</div>
            <div className="mt-[6px] max-w-[560px] text-[12px] leading-[1.6] text-txt-3 text-pretty">{t("hero_sub")}</div>
            {data?.changedAt ? <div className="mt-[6px] font-mono text-[10.5px] text-txt-4">{t("last_changed", { time: formatDateTime(data.changedAt) })}</div> : null}
          </div>
          {data?.selected ? (
            <div className="flex flex-col items-end gap-[6px]">
              <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-txt-4">{t("active_label")}</span>
              <span className="text-[13px] font-bold">{t(`option_${data.selected}_name`)}</span>
              <StatusPill view={active} />
            </div>
          ) : null}
        </div>
        <ProviderSetupPanel setup={setup} signIn="modal" />
        {switching && data?.selected && choice ? (
          <p className="m-0 text-[12px] leading-[1.55] text-amber text-pretty">
            {t("switch_confirm", { from: t(`option_${data.selected}_name`), to: t(`option_${choice}_name`) })}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-[10px]">
          <Button variant="primary" disabled={!dirty || setup.busy} onClick={() => void setup.commit(false)}>
            {setup.phase === "saving" ? t("saving") : switching ? t("use_provider") : t("save")}
          </Button>
          {setup.canContinueAnyway ? (
            <Button disabled={setup.busy} onClick={() => void setup.commit(true)}>
              {t("continue_anyway")}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-[8px] rounded-[22px] surface-sheen px-[22px] py-[16px] shadow-[var(--lift)]">
        <div className="text-[14.5px] font-bold">{t("prices_title")}</div>
        <p className="m-0 text-[11.5px] leading-[1.55] text-txt-3 text-pretty">{t("prices_hint")}</p>
        <PriceSourceLine withRefresh />
      </div>
    </>
  );
}
