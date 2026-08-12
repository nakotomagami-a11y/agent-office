"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";

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
      <h3 className="font-semibold m-0 mb-[6px] text-[15px]">{t("first_run.excluded_title")}</h3>
      <p className="text-txt-3 m-0 mb-[12px] text-[12.5px] leading-[1.5]">{t("first_run.excluded_hint")}</p>
      <div className="flex flex-wrap gap-[6px] mb-[10px]">
        {excluded.map((name) => (
          <button
            key={name}
            type="button"
            className="inline-flex items-center bg-bg-2 border border-line rounded-full cursor-pointer text-txt-2 gap-[4px] px-[9px] py-[3px] font-[var(--font-mono)] text-[11.5px] hover:bg-bg-1 hover:text-txt"
            onClick={() => onRemove(name)}
            title={t("first_run.excluded_remove", { name })}
          >
            {name} <Icon name="x" size={11} />
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <TextInput
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={t("first_run.excluded_placeholder")}
        />
        <Button variant="ghost" size="sm" onClick={onAdd}>
          {t("first_run.excluded_add")}
        </Button>
      </div>
    </section>
  );
}
