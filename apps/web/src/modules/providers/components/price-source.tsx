"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { formatDateTime } from "@/lib/format-date";
import { ApiError } from "@/lib/api/fetch";
import { useModelPrices, useRefreshModelPrices } from "../hooks/use-providers";

const SOURCE_NAME = { litellm: "LiteLLM", openrouter: "OpenRouter" } as const;

/**
 * Where the prices on screen came from, and how old they are. Prices are fetched,
 * never hardcoded, so the source and date are part of the number's meaning; a stale
 * catalog is still used, and says so.
 */
export function PriceSourceLine({ withRefresh = false }: { withRefresh?: boolean }) {
  const t = useTranslations("providers");
  const q = useModelPrices();
  const refresh = useRefreshModelPrices();
  const data = q.data;

  let text = t("prices_loading");
  if (q.isError) text = t("prices_unavailable");
  else if (data) {
    text =
      data.source && data.fetchedAt
        ? t("prices_source", { source: SOURCE_NAME[data.source], date: formatDateTime(data.fetchedAt) })
        : t("prices_unavailable");
  }

  return (
    <div className="flex flex-wrap items-center gap-[8px] text-[11.5px] text-txt-3">
      <Icon name="gauge" size={12} className="shrink-0" />
      <span>{text}</span>
      {data?.stale ? (
        <span className="rounded-full bg-amber-soft px-[8px] py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-amber">
          {t("prices_stale")}
        </span>
      ) : null}
      {withRefresh ? (
        <Button size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          {refresh.isPending ? t("prices_refreshing") : t("prices_refresh")}
        </Button>
      ) : null}
      {refresh.isError ? (
        <span role="alert" className="text-red">
          {refresh.error instanceof ApiError && refresh.error.status === 429 ? t("prices_refresh_wait") : t("prices_refresh_failed")}
        </span>
      ) : null}
    </div>
  );
}
