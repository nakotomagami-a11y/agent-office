"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/ui/icon";
import { formatDateTime } from "@/lib/format-date";
import { ApiError } from "@/lib/api/fetch";
import { useModelPrices, useRefreshModelPrices, useSetPriceFetch } from "../hooks/use-providers";

const SOURCE_NAME = { litellm: "LiteLLM", openrouter: "OpenRouter" } as const;

/**
 * Where the prices on screen came from, and how old they are. Prices are fetched,
 * never hardcoded, so the source and date are part of the number's meaning; a stale
 * catalog is still used, and says so.
 */
/** 409 is "fetching is off", 429 "too soon", 502 "both sources failed"; anything else is a plain failure. */
function refreshErrorKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "prices_refresh_wait";
    if (err.status === 409) return "prices_fetch_off";
    if (err.status === 502) return "prices_refresh_offline";
  }
  return "prices_refresh_failed";
}

export function PriceSourceLine({ withRefresh = false }: { withRefresh?: boolean }) {
  const t = useTranslations("providers");
  const q = useModelPrices();
  const refresh = useRefreshModelPrices();
  const setFetch = useSetPriceFetch();
  const data = q.data;
  const fetchOff = data?.fetchEnabled === false;

  let text = t("prices_loading");
  if (q.isError) text = t("prices_unavailable");
  else if (fetchOff) text = t("prices_fetch_off");
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
        <Button size="sm" className="max-[600px]:min-h-[40px]" onClick={() => refresh.mutate()} disabled={refresh.isPending || fetchOff || !data}>
          {refresh.isPending ? t("prices_refreshing") : t("prices_refresh")}
        </Button>
      ) : null}
      {withRefresh && data ? (
        <span className="flex items-center gap-[8px]">
          <Switch
            checked={data.fetchEnabled}
            onChange={(next) => setFetch.mutate(next, { onSuccess: () => next && refresh.mutate() })}
            disabled={setFetch.isPending}
            label={t("prices_fetch_toggle")}
          />
          <span>{t("prices_fetch_toggle")}</span>
        </span>
      ) : null}
      {refresh.isError ? (
        <span role="alert" className="text-red">{t(refreshErrorKey(refresh.error))}</span>
      ) : null}
      {setFetch.isError ? <span role="alert" className="text-red">{t("prices_fetch_toggle_failed")}</span> : null}
    </div>
  );
}
