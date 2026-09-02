"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";

export type ExcludedStepProps = {
  excluded: string[];
  input: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (name: string) => void;
};

/** Wizard step 3: manage folder names to exclude from the project scan. */
export function ExcludedStep({ excluded, input, onInputChange, onAdd, onRemove }: ExcludedStepProps) {
  const t = useTranslations();
  return (
    <section>
      <h3 className="m-0 text-[16.5px] font-extrabold tracking-[-0.025em]">{t("first_run.excluded_title")}</h3>
      <p className="m-0 mt-[6px] max-w-[560px] text-[12.5px] leading-[1.6] text-txt-3 text-pretty">
        {t("first_run.excluded_hint")}
      </p>

      <div className="mt-4 flex flex-wrap gap-[8px]">
        {excluded.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onRemove(name)}
            title={t("first_run.excluded_remove", { name })}
            className="inline-flex cursor-pointer items-center gap-[6px] rounded-full border border-edge bg-card-2 px-[12px] py-[6px] font-mono text-[11.5px] text-txt-2 transition-colors hover:border-acc-line hover:text-acc"
          >
            {name}
            <Icon name="x" size={11} />
          </button>
        ))}
      </div>

      <div className="mt-[12px] flex gap-[8px]">
        <input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={t("first_run.excluded_placeholder")}
          className="min-w-0 flex-1 rounded-2xl border border-edge bg-card-2 px-[14px] py-[11px] text-[13px] text-txt outline-none focus:border-acc"
        />
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 cursor-pointer rounded-2xl border border-edge bg-card px-[16px] py-[11px] text-[12.5px] font-bold text-txt-2 transition-colors hover:border-acc-line hover:text-acc"
        >
          {t("first_run.excluded_add")}
        </button>
      </div>

      <p className="mt-[14px] rounded-2xl border border-edge bg-card px-4 py-[11px] text-[11.5px] leading-[1.6] text-txt-3">
        {t("first_run.excluded_note")}
      </p>
    </section>
  );
}
