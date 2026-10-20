"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import type { ProviderSetup } from "../hooks/use-provider-setup";
import { ProviderFields } from "./provider-fields";
import { ProviderPicker } from "./provider-picker";
import { ProviderTestPanel, type SignInMode } from "./provider-test-panel";

/**
 * The picker, the picked provider's fields and the test, shared by the wizard
 * step and the Settings tab. It owns no state: `setup` does, so each caller
 * decides what saving means (Next in the wizard, an explicit button in Settings).
 */
export function ProviderSetupPanel({ setup, signIn }: { setup: ProviderSetup; signIn: SignInMode }) {
  const t = useTranslations("providers");
  const { choice, data } = setup;

  if (setup.loading) {
    return <p className="m-0 text-[12.5px] text-txt-3">{t("loading")}</p>;
  }
  if (setup.loadError || !data) {
    return (
      <div role="alert" className="flex flex-col items-start gap-[8px] rounded-xl border border-[var(--error)] bg-[rgba(239,68,68,0.08)] px-[12px] py-[10px]">
        <p className="m-0 text-[12.5px] text-red">{t("load_failed")}</p>
        <button type="button" onClick={() => void setup.refetch()} className="text-[12px] font-semibold text-acc hover:underline">
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">
      <p className="m-0 flex items-start gap-[8px] text-[12px] leading-[1.55] text-txt-3 text-pretty">
        <Icon name="lock" size={13} className="mt-[2px] shrink-0" />
        {t("never_swaps")}
      </p>
      <ProviderPicker value={choice} onChange={setup.setChoice} activeId={data.selected} disabled={setup.busy} />
      {choice ? (
        <div className="flex flex-col gap-[14px] rounded-2xl border border-edge bg-card-2 px-[16px] py-[14px]">
          <ProviderFields
            provider={choice}
            draft={setup.draft}
            view={setup.view}
            onEdit={setup.edit}
            onEnter={() => void setup.runTest()}
            availableModels={setup.outcome?.availableModels ?? []}
          />
          <ProviderTestPanel setup={setup} signIn={signIn} />
          <p className="m-0 text-[11.5px] leading-[1.6] text-txt-3 text-pretty">{t(`privacy_${choice}`)}</p>
        </div>
      ) : null}
    </div>
  );
}
