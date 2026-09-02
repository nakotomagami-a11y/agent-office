import { useTranslations } from "next-intl";
import { INTEGRATIONS } from "@agent-office/domain/config/integrations";
import { IntegrationRow } from "@/modules/settings/components/integration-row";

/** First-run step: pick which integrations to enable. Fully controlled by the
 *  wizard — state is applied to settings.integrations on finish. */
export function IntegrationsStep({
  selected,
  onToggle,
}: {
  selected: Record<string, boolean>;
  onToggle: (id: string, next: boolean) => void;
}) {
  const t = useTranslations();
  return (
    <div>
      <h3 className="m-0 text-[16.5px] font-extrabold tracking-[-0.025em]">{t("first_run.integrations_title")}</h3>
      <p className="m-0 mt-[6px] max-w-[560px] text-[12.5px] leading-[1.6] text-txt-3 text-pretty">
        {t("first_run.integrations_hint")}
      </p>
      <div className="mt-4 flex flex-col gap-[10px]">
        {INTEGRATIONS.map((def) => (
          <IntegrationRow
            key={def.id}
            def={def}
            enabled={selected[def.id] ?? def.defaultEnabled}
            onToggle={(next) => onToggle(def.id, next)}
          />
        ))}
      </div>
    </div>
  );
}
