import { getTranslations } from "next-intl/server";
import { SettingsPage } from "@/modules/settings/components/settings-page";

export default async function SettingsRoute() {
  const t = await getTranslations();
  return (
    <>
      <div className="flex items-center gap-[12px] px-[20px] pt-[16px]">
        <div className="flex items-end gap-[12px] min-w-0">
          <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.035em]">{t("nav.settings")}</h1>
          <span className="font-[var(--font-mono)] text-[11.5px] text-txt-4 pb-[6px] whitespace-nowrap">{t("settings_page.sub")}</span>
        </div>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-[7px] py-[8px] px-[14px] rounded-full surface-sheen shadow-[var(--lift)] font-[var(--font-mono)] text-[10.5px] text-txt-4 whitespace-nowrap">
          <span className="w-[5px] h-[5px] rounded-full bg-green" aria-hidden />
          ~/.agent-office/config.toml
        </span>
      </div>
      <SettingsPage />
    </>
  );
}
