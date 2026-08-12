"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { OfficeToolbar } from "./office-toolbar";
import { OfficeHud } from "./office-hud";
import { OfficeScene } from "./office-scene";
import { CardsOffice } from "./cards-office";
import { useOfficeStore } from "../hooks/use-office-store";
import { useOfficeAgents } from "../hooks/use-office-agents";
import { ChatPanel } from "@/modules/summon/components/chat-panel";
import { useSummonStore } from "@/modules/summon/hooks/use-summon-store";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { useProject } from "@/modules/projects/hooks/use-projects";
import { useClaudeLimitsStore } from "@/lib/claude-limits-store";
import { usePerformanceStore } from "@/lib/performance-store";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";

export function OfficeView() {
  const t = useTranslations();
  const isoEnabled = useOfficeStore((s) => s.isoEnabled);
  const storedView = useOfficeStore((s) => s.view);
  const setView = useOfficeStore((s) => s.setView);
  const perfMode = usePerformanceStore((s) => s.mode);

  // `canUseIso` = iso is enabled in the dev menu AND the rendering budget is
  // Full. Only then is the iso floor loadable and the in-app iso/cards switch
  // shown; the user's stored iso/cards choice (`storedView`) then decides which
  // is active. When iso is disabled there is no switch and cards is the only view.
  const canUseIso = isoEnabled && perfMode === "full";
  const view = canUseIso ? storedView : "cards";
  const selectedId = useOfficeStore((s) => s.selectedId);
  const select = useOfficeStore((s) => s.select);

  const chatOpen = useSummonStore((s) => s.open);
  const chatAgentId = useSummonStore((s) => s.agentId);
  const summonProjectId = useSummonStore((s) => s.projectId);
  const instanceId = useSummonStore((s) => s.instanceId);
  const closeChat = useSummonStore((s) => s.closeChat);

  const { agents, workingCount, errorCount, spendToday, isLoading } = useOfficeAgents();
  const activeProjectId = useActiveProjectStore((s) => s.id);
  const projectId = summonProjectId ?? activeProjectId ?? null;
  const projectQ = useProject(activeProjectId);
  const project = projectQ.data;

  const quotaUsd = useClaudeLimitsStore((s) => s.quotaUsd);
  const budgetDaily = quotaUsd === 0 ? undefined : quotaUsd;

  const [errorFilter, setErrorFilter] = useState(false);

  const scopedAgents = useMemo(() => {
    const base = (() => {
      if (!activeProjectId) return agents;
      if (!project) return [];
      const rosterIds = new Set(project.meta.roster.map((i) => i.agentId));
      return agents.filter((a) => rosterIds.has(a.id));
    })();
    if (errorFilter) return base.filter((a) => a.status === "error");
    return base;
  }, [agents, activeProjectId, project, errorFilter]);

  const floorLoading = isLoading || (!!activeProjectId && projectQ.isLoading);

  const chatAgent = agents.find((a) => a.id === chatAgentId) ?? null;

  const selectFromFloor = useCallback(
    (id: string) => {
      const instance = project?.meta.roster.find((i) => i.agentId === id);
      select(id, { instanceId: instance?.instanceId ?? null });
    },
    [project, select],
  );

  if (chatOpen && chatAgent) {
    return <ChatPanel agent={chatAgent} projectId={projectId ?? undefined} instanceId={instanceId} onClose={closeChat} />;
  }

  return (
    <>
      {view === "iso" && (
        <OfficeToolbar
          agentCount={agents.length}
          workingCount={workingCount}
        />
      )}
      <div className="relative overflow-hidden flex-1 min-h-0 [background:radial-gradient(ellipse_at_50%_0%,rgba(233,84,32,0.05),transparent_60%),var(--bg-1)]">
        {view === "iso" ? (
          <>
            <OfficeHud
              errorCount={errorCount}
              spendToday={spendToday}
              budgetDaily={budgetDaily}
              onErrorFilter={() => setErrorFilter((v) => !v)}
            />

            {errorFilter && (
              <div
                className="flex items-center gap-2 px-4 py-[6px] text-[12.5px] text-txt-2 bg-[color-mix(in_srgb,var(--error)_10%,transparent)] border-b border-b-[color-mix(in_srgb,var(--error)_20%,transparent)]"
              >
                <span
                  aria-hidden
                  className="inline-block shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--error)]"
                />
                {t("office.error_filter_banner")}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setErrorFilter(false)}
                >
                  {t("office.error_filter_clear")}
                </Button>
              </div>
            )}

            <OfficeScene key={activeProjectId ?? "global"} projectId={activeProjectId ?? null} />
          </>
        ) : (
          <CardsOffice
            agents={scopedAgents}
            isLoading={floorLoading}
            hasProject={!!project || !!activeProjectId}
            selectedId={selectedId}
            onSelect={selectFromFloor}
            view={view}
            setView={setView}
            canUseIso={canUseIso}
            projectId={activeProjectId}
            projectName={project?.meta.name ?? null}
            rosterCount={project?.meta.roster.length ?? scopedAgents.length}
            workingCount={workingCount}
          />
        )}
      </div>
    </>
  );
}
