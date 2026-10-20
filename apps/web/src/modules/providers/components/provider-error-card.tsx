"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { isProviderStatusReason } from "@agent-office/domain/config/providers";
import { PAGE_ROUTES } from "@/lib/page-routes";
import { FlagCard, type FlagAction } from "@/modules/summon/components/flag-card";
import { REASON_ACTION } from "../format/provider-format";

/** Run codes that mean the chosen AI provider failed, not the agent. */
export const isProviderRunCode = (code: string): boolean => code.startsWith("provider_");

/**
 * A failed run on the chosen provider. The fix is always in Settings, never "sign in": the
 * card says which provider failed and why, and never offers another provider. `detail` is a
 * status reason for a refused spawn (`provider_unavailable`), so it picks the body copy; for
 * the other codes it is short raw context and shown as such.
 */
export function ProviderErrorCard({
  code,
  detail,
  onRetry,
  onSkip,
}: {
  code: string;
  detail?: string;
  onRetry?: () => void;
  onSkip?: () => void;
}) {
  const t = useTranslations("errors.run");
  const te = useTranslations("errors.provider");
  const router = useRouter();
  const reason = isProviderStatusReason(detail) ? detail : null;
  // A rejected key or a spending cap fails again the same way, so Retry would only repeat it.
  const retryHelps = code === "provider_unreachable" || (reason !== null && REASON_ACTION[reason] === "recheck");
  const actions: FlagAction[] = [
    { key: "settings", label: t(`${code}.action`), tone: "primary", onClick: () => router.push(PAGE_ROUTES.settingsProvider) },
    ...(retryHelps ? [{ key: "retry", label: "Retry", tone: "neutral", onClick: onRetry, disabled: !onRetry } satisfies FlagAction] : []),
    { key: "skip", label: "Skip", tone: "neutral", onClick: onSkip, disabled: !onSkip },
  ];
  return (
    <FlagCard
      tone="err"
      icon="circle-x"
      title={reason ? te(`${reason}.title`) : t(`${code}.title`)}
      body={reason ? te(`${reason}.body`) : t(`${code}.body`)}
      detail={reason ? undefined : detail}
      actions={actions}
    />
  );
}
