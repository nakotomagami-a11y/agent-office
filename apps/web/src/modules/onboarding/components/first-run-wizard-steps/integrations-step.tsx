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
      <h3 className="font-semibold m-0 mb-[6px] text-[15px]">{t("first_run.integrations_title")}</h3>
      <p className="text-txt-3 m-0 mb-[12px] text-[12.5px] leading-[1.5]">{t("first_run.integrations_hint")}</p>
      <div className="flex flex-col gap-2">
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
