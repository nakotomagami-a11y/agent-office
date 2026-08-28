"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { OfficeToolbar } from "./office-toolbar";
import { OfficeHud } from "./office-hud";
import { OfficeScene } from "./office-scene";
import { Icon } from "@/components/ui/icon";
import { useOfficeStore } from "../hooks/use-office-store";
import { useOfficeAgents } from "../hooks/use-office-agents";
import { ChatPanel } from "@/modules/summon/components/chat-panel";
import { useSummonStore } from "@/modules/summon/hooks/use-summon-store";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { useClaudeLimitsStore } from "@/lib/claude-limits-store";
import { usePerformanceStore } from "@/lib/performance-store";
import { Button } from "@/components/ui/button";

/**
 * The office page is iso-only. The flat "cards" fallback was removed — when the
 * Isometric view integration is off (or the perf budget isn't Full) the page
 * shows a prompt to enable it in Settings rather than a second layout. The
 * "Office" nav entry is likewise hidden while iso is off (see main-top-bar /
 * mobile-bottom-nav), so this disabled state is only reachable by direct URL.
 */
export function OfficeView() {
  const t = useTranslations();
  const isoEnabled = useOfficeStore((s) => s.isoEnabled);
  const perfMode = usePerformanceStore((s) => s.mode);

  // Iso renders only when the integration is on AND the rendering budget is
  // Full (the PixiJS floor is heavy). Otherwise the page is disabled.
  const canUseIso = isoEnabled && perfMode === "full";

  const chatOpen = useSummonStore((s) => s.open);
  const chatAgentId = useSummonStore((s) => s.agentId);
  const summonProjectId = useSummonStore((s) => s.projectId);
  const instanceId = useSummonStore((s) => s.instanceId);
  const closeChat = useSummonStore((s) => s.closeChat);

  const { agents, workingCount, errorCount, spendToday } = useOfficeAgents();
  const activeProjectId = useActiveProjectStore((s) => s.id);
  const projectId = summonProjectId ?? activeProjectId ?? null;

  const quotaUsd = useClaudeLimitsStore((s) => s.quotaUsd);
  const budgetDaily = quotaUsd === 0 ? undefined : quotaUsd;

  const [errorFilter, setErrorFilter] = useState(false);

  const chatAgent = agents.find((a) => a.id === chatAgentId) ?? null;

  if (chatOpen && chatAgent) {
    return <ChatPanel agent={chatAgent} projectId={projectId ?? undefined} instanceId={instanceId} onClose={closeChat} />;
  }

  if (!canUseIso) {
    return <IsoDisabledState isoEnabled={isoEnabled} perfMode={perfMode} />;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-[16px] px-[20px] pt-[16px] pb-[20px]">
      <OfficeToolbar agentCount={agents.length} workingCount={workingCount} />
      <div className="relative overflow-hidden flex-1 min-h-0 rounded-[24px] surface-sheen shadow-[var(--lift)]">
        <OfficeHud
          errorCount={errorCount}
          spendToday={spendToday}
          budgetDaily={budgetDaily}
          onErrorFilter={() => setErrorFilter((v) => !v)}
        />

        {errorFilter && (
          <div className="absolute top-0 left-0 right-0 z-[11] flex items-center gap-2 px-4 py-[6px] text-[12.5px] text-txt-2 bg-[color-mix(in_srgb,var(--error)_10%,transparent)] border-b border-b-[color-mix(in_srgb,var(--error)_20%,transparent)]">
            <span aria-hidden className="inline-block shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--error)]" />
            {t("office.error_filter_banner")}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setErrorFilter(false)}>
              {t("office.error_filter_clear")}
            </Button>
          </div>
        )}

        <OfficeScene key={activeProjectId ?? "global"} projectId={activeProjectId ?? null} />
      </div>
    </div>
  );
}

/** Shown when the iso integration is off (or perf mode isn't Full). */
function IsoDisabledState({ isoEnabled, perfMode }: { isoEnabled: boolean; perfMode: string }) {
  const t = useTranslations("office_view");
  const perfBlocks = isoEnabled && perfMode !== "full";
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-[16px] p-[40px] text-center">
      <span className="w-[56px] h-[56px] rounded-[18px] flex items-center justify-center bg-card-2 text-txt-4 shadow-[inset_0_0_0_1px_var(--edge)]">
        <Icon name="layers" size={26} />
      </span>
      <div className="flex flex-col items-center gap-[6px]">
        <h1 className="m-0 text-[20px] font-bold tracking-[-0.02em]">{t("iso_disabled_title")}</h1>
        <p className="m-0 max-w-[400px] text-[13.5px] leading-[1.6] text-txt-3">
          {perfBlocks ? t("iso_disabled_perf_body") : t("iso_disabled_body")}
        </p>
      </div>
      <Link
        href={PAGE_ROUTES.settings}
        className="flex items-center gap-[8px] px-[16px] py-[10px] rounded-[12px] bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[13px] font-bold no-underline shadow-[0_12px_26px_-12px_rgba(139,123,255,0.8)] transition-transform duration-150 hover:-translate-y-[1px]"
      >
        <Icon name="settings" size={14} /> {t("open_settings")}
      </Link>
    </div>
  );
}
