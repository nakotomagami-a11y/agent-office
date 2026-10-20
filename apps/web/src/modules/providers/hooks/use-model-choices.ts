"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { MODEL_CATALOG, MODEL_IDS, type ModelId } from "@agent-office/domain/config/models";
import { usesGateway } from "@agent-office/domain/config/providers";
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
 * The model cards the agent editor offers, for the provider agents run on. Under a gateway
 * provider an agent's `haiku|sonnet|opus` is a tier that the provider's map turns into a real
 * model, so those are shown with that model, and Fable (a Claude-only test variant) is hidden.
 * Prices come from the fetched catalog; a model it doesn't list shows a dash, not a guess.
 */
export function useModelChoices(): { models: ModelChoice[]; effort: boolean } {
  const t = useTranslations("providers");
  const { id: providerId, view, capabilities } = useActiveProvider();
  const prices = useModelPrices().data?.entries;
  const gateway = usesGateway(providerId);
  const mapped = view?.config.models;

  const models = useMemo(() => {
    const ids = gateway ? MODEL_IDS.filter((id) => id !== "fable") : MODEL_IDS;
    return ids.map((id) => {
      const info = MODEL_CATALOG[id];
      const full = gateway ? (mapped?.[id as "haiku" | "sonnet" | "opus"] ?? "—") : info.fullId;
      return {
        id,
        name: gateway ? t(`tier_${id}`) : id,
        full,
        badge: info.tier,
        icon: info.icon,
        price: ((figure) => (figure ? t("price_per_mtok", { price: figure }) : "—"))(formatPerMTok(inputPriceOf(prices, full))),
        desc: info.description,
      };
    });
  }, [gateway, mapped, prices, t]);

  return { models, effort: capabilities.effort };
}
