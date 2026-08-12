import { useTranslations } from "next-intl";

export type OfficeHudProps = {
  errorCount: number;
  spendToday: number;
  budgetDaily?: number;
  onErrorFilter?: () => void;
};

function spendStyle(spendToday: number, budgetDaily: number): React.CSSProperties {
  const ratio = budgetDaily > 0 ? spendToday / budgetDaily : 0;
  if (ratio >= 1) {
    return {
      background: "color-mix(in srgb, var(--error) 15%, transparent)",
      borderColor: "color-mix(in srgb, var(--error) 40%, transparent)",
    };
  }
  if (ratio >= 0.8) {
    return {
      background: "color-mix(in srgb, var(--queued) 15%, transparent)",
      borderColor: "color-mix(in srgb, var(--queued) 40%, transparent)",
    };
  }
  return {};
}

export function OfficeHud({
  errorCount,
  spendToday,
  budgetDaily,
  onErrorFilter,
}: OfficeHudProps) {
  const t = useTranslations();

  const errorCard = (
    <>
      <span
        aria-hidden
        className="w-2 h-2 rounded-full bg-[var(--error)] inline-block"
      />{" "}
      <b>{errorCount}</b> {t("office.needs_attention_label")}
    </>
  );

  return (
    <div className="absolute flex items-center gap-2 pointer-events-none z-[5] top-[14px] left-[18px] right-[18px]">
      {errorCount > 0 ? (
        onErrorFilter ? (
          <button
            type="button"
            className="pointer-events-auto inline-flex items-center gap-2 border border-line rounded-full text-[12px] bg-[rgba(255,255,255,0.85)] dark:bg-[rgba(42,37,34,0.85)] backdrop-blur-[12px] px-3 py-[6px] shadow-1 cursor-pointer"
            onClick={onErrorFilter}
            title="Show agents needing attention"
          >
            {errorCard}
          </button>
        ) : (
          <div className="pointer-events-auto inline-flex items-center gap-2 border border-line rounded-full text-[12px] bg-[rgba(255,255,255,0.85)] dark:bg-[rgba(42,37,34,0.85)] backdrop-blur-[12px] px-3 py-[6px] shadow-1">{errorCard}</div>
        )
      ) : null}
      <div className="flex-1" />
      {budgetDaily ? (
        <div
          className="pointer-events-auto inline-flex items-center gap-2 border border-line rounded-full text-[12px] bg-[rgba(255,255,255,0.85)] dark:bg-[rgba(42,37,34,0.85)] backdrop-blur-[12px] px-3 py-[6px] shadow-1 transition-[background,border-color] duration-300"
          style={spendStyle(spendToday, budgetDaily)}
        >
          {t("office.budget_daily")} <b>${budgetDaily.toFixed(2)}/day</b>
        </div>
      ) : null}
    </div>
  );
}
