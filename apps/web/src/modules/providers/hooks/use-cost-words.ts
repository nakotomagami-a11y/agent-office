"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { CostWords } from "../format/run-cost";

export function useCostWords(): CostWords {
  const t = useTranslations("providers");
  return useMemo(
    () => ({ unknown: t("cost_unknown"), free: t("cost_free"), estimated: (amount: string) => t("cost_estimated", { amount }) }),
    [t],
  );
}
