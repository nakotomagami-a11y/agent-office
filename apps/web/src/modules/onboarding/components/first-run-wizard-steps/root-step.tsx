"use client";

import { useTranslations } from "next-intl";
import { TextInput } from "@/components/ui/text-input";

export type RootStepProps = {
  root: string;
  onRootChange: (v: string) => void;
  placeholder: string;
};

/** Wizard step 2: pick the projects-root directory. */
export function RootStep({ root, onRootChange, placeholder }: RootStepProps) {
  const t = useTranslations();
  return (
    <section>
      <h3 className="font-semibold m-0 mb-[6px] text-[15px]">{t("first_run.root_title")}</h3>
      <p className="text-txt-3 m-0 mb-[12px] text-[12.5px] leading-[1.5]">{t("first_run.root_hint")}</p>
      <TextInput
        value={root}
        onChange={(e) => onRootChange(e.target.value)}
        placeholder={placeholder}
        autoFocus
      />
      <p className="text-txt-3 m-0 text-[11.5px] leading-[1.5] mt-[6px]">{t("first_run.root_examples")}</p>
    </section>
  );
}
