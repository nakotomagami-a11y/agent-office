"use client";

import { useTranslations } from "next-intl";
import { PROVIDERS, type Provider } from "@agent-office/domain/config/providers";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

const OPTION_ICON: Record<Provider, IconName> = {
  subscription: "sparkle",
  anthropic_api: "lock",
  openai: "zap",
  local: "terminal-ao",
};

function Option({ id, checked, active, disabled, onChange }: { id: Provider; checked: boolean; active: boolean; disabled?: boolean; onChange: () => void }) {
  const t = useTranslations("providers");
  return (
    <label
      className={cn(
        "relative flex flex-1 basis-[180px] min-w-[160px] cursor-pointer flex-col gap-[6px] rounded-2xl border bg-card px-[14px] py-[12px] transition-[border-color,background] duration-150",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-acc",
        checked ? "border-acc bg-acc-soft" : "border-edge hover:border-edge-2",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input type="radio" name="provider" value={id} checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />
      <span className="flex items-center gap-[8px]">
        <span className={cn("flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[9px]", checked ? "bg-acc text-acc-ink" : "bg-card-2 text-txt-3")}>
          <Icon name={OPTION_ICON[id]} size={14} />
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-bold leading-[1.25]">{t(`option_${id}_name`)}</span>
        {active ? (
          <span className="shrink-0 rounded-full bg-green-soft px-[7px] py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-green">
            {t("badge_active")}
          </span>
        ) : null}
      </span>
      <span className="text-[11px] leading-[1.5] text-txt-3 text-pretty">{t(`option_${id}_tag`)}</span>
    </label>
  );
}

/**
 * The four providers as one radio group. Native radios keep arrow-key navigation, a single tab
 * stop and screen-reader grouping for free; the card is just their label. Nothing here saves:
 * the choice is only a draft until the server accepts it, and `activeId` marks what it has.
 */
export function ProviderPicker({
  value,
  onChange,
  activeId,
  disabled,
}: {
  value: Provider | null;
  onChange: (next: Provider) => void;
  activeId: Provider | null;
  disabled?: boolean;
}) {
  const t = useTranslations("providers");
  return (
    <div role="radiogroup" aria-label={t("picker_aria")} className="flex flex-wrap gap-[10px]">
      {PROVIDERS.map((id) => (
        <Option key={id} id={id} checked={id === value} active={id === activeId} disabled={disabled} onChange={() => onChange(id)} />
      ))}
    </div>
  );
}
