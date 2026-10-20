"use client";

import { useTranslations } from "next-intl";
import { ProviderSetupPanel } from "@/modules/providers/components/provider-setup-panel";
import type { ProviderSetup } from "@/modules/providers/hooks/use-provider-setup";

/**
 * Wizard step 1: which AI runs the crew. Mandatory: Next saves the provider on
 * the server and only advances once the server accepts it, so the provider
 * exists before the settings file does. State lives in the wizard (`setup`)
 * because Next sits in its footer.
 */
export function ProviderStep({ setup }: { setup: ProviderSetup }) {
  const t = useTranslations("first_run");
  return (
    <section>
      <h3 className="m-0 text-[16.5px] font-extrabold tracking-[-0.025em]">{t("provider_title")}</h3>
      <p className="m-0 mt-[6px] max-w-[560px] text-[12.5px] leading-[1.6] text-txt-3 text-pretty">{t("provider_hint")}</p>
      <div className="mt-[16px]">
        <ProviderSetupPanel setup={setup} signIn="inline" />
      </div>
    </section>
  );
}
