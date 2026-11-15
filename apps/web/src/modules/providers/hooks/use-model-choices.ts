"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { MODEL_CATALOG, MODEL_IDS, type ModelId } from "@agent-office/domain/config/models";
import { mapsModelTiers } from "@agent-office/domain/config/providers";
import { formatPerMTok, inputPriceOf } from "../format/provider-format";
import { useActiveProvider, useModelPrices } from "./use-providers";

export interface ModelChoice {
  id: ModelId;
  name: string;
  /** The model id agents actually run on: the catalog's for Claude, the provider's tier map otherwise. */
  full: string;
  badge: string;
  icon: string;
  price: string;
  desc: string;
}

/**
 * The model cards the agent editor offers, for the provider agents run on. On openai/local
 * an agent's `haiku|sonnet|opus` is a tier that the provider's map turns into a real
 * model, so those are shown with that model, and Fable (a Claude-only test variant) is hidden.
 * Prices come from the fetched catalog; a model it doesn't list shows a dash, not a guess.
 */
export function useModelChoices(): { models: ModelChoice[]; effort: boolean } {
  const t = useTranslations("providers");
  const { id: providerId, view, capabilities } = useActiveProvider();
  const prices = useModelPrices().data?.entries;
  const mapsTiers = mapsModelTiers(providerId);
  const mapped = view?.config.models;

  const models = useMemo(() => {
    const ids = mapsTiers ? MODEL_IDS.filter((id) => id !== "fable") : MODEL_IDS;
    return ids.map((id) => {
      const info = MODEL_CATALOG[id];
      const full = mapsTiers ? (mapped?.[id as "haiku" | "sonnet" | "opus"] ?? "—") : info.fullId;
      return {
        id,
        name: mapsTiers ? t(`tier_${id}`) : id,
        full,
        badge: info.tier,
        icon: info.icon,
        price: ((figure) => (figure ? t("price_per_mtok", { price: figure }) : "—"))(formatPerMTok(inputPriceOf(prices, full))),
        desc: info.description,
      };
    });
  }, [mapsTiers, mapped, prices, t]);

  return { models, effort: capabilities.effort };
}
