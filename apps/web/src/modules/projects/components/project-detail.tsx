"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanetEditorModal } from "@/components/ui/planet-editor-modal";
import { useGitStatus, useProject, useUpdateProject } from "../hooks/use-projects";
import { useOfficeAgents } from "@/modules/office/hooks/use-office-agents";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { useProjectDetailActions } from "../hooks/use-project-detail-actions";
import { AddAgentModal } from "./add-agent-modal";
import { ProjectHero } from "./project-hero";
import { ProjectLiveRuns } from "./project-live-runs";
import { ProjectStatCards } from "./project-stat-cards";
import { ProjectRecentRuns } from "./project-recent-runs";
import { ProjectEnvironmentCard } from "./project-environment-card";
import { ProjectMemoryCard } from "./project-memory-card";
import { ProjectBackupCard } from "./project-backup-card";
import { ProjectDangerZone } from "./project-danger-zone";

export type ProjectDetailProps = { id: string };

/**
 * V3 project dashboard. There is no separate "Project" page header here — the
 * cosmic hero card IS the header, confirmed against the raw V3 mockup (no H1
 * sits above the two-column grid). Every stat below is derived from real
 * data: `useRuns`, `useGitStatus`, and the project's own `runCount`/`memory`.
 */
export function ProjectDetail({ id }: ProjectDetailProps) {
  const t = useTranslations();
  const projectQ = useProject(id);
  const updateMut = useUpdateProject();
  const { agents: allAgents } = useOfficeAgents();
  const gitStatusQ = useGitStatus(id, !!projectQ.data?.meta.cwd);
  const runsQ = useRuns({ projectId: id, limit: 100 });
  const { backup, danger } = useProjectDetailActions(id, projectQ.data, () => projectQ.refetch());

  const [planetEditorOpen, setPlanetEditorOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const project = projectQ.data;

  if (projectQ.isLoading) {
    return (
      <div className="p-[20px] flex flex-col gap-[16px]">
        <Skeleton width="100%" height={220} />
        <Skeleton width="100%" height={120} />
      </div>
    );
  }
  if (!project) {
    return <div className="p-[20px] text-txt-3">{t("errors.not_found")}</div>;
  }

  const rosterAgentIds = [...new Set(project.meta.roster.map((r) => r.agentId))];
  const workingCount = allAgents.filter(
    (a) => rosterAgentIds.includes(a.id) && (a.status === "working" || a.status === "thinking"),
  ).length;

  return (
    <>
      <AddAgentModal open={addOpen} projectId={id} onClose={() => setAddOpen(false)} />
      <PlanetEditorModal
        open={planetEditorOpen}
        projectId={id}
        current={project.meta.planet}
        onSave={(cfg) => void updateMut.mutateAsync({ id, patch: { meta: { planet: cfg } } })}
        onClose={() => setPlanetEditorOpen(false)}
      />

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[16px] p-[20px] [&>*]:shrink-0">
        <div className="flex flex-wrap gap-[16px]">
          <ProjectHero
            project={project}
            rosterAgentIds={rosterAgentIds}
            workingCount={workingCount}
            allAgents={allAgents}
            onOpenPlanetEditor={() => setPlanetEditorOpen(true)}
            onAddAgent={() => setAddOpen(true)}
            onSaveDescription={(description) => updateMut.mutateAsync({ id, patch: { meta: { description } } })}
          />
          <ProjectLiveRuns projectId={id} onSummonAnother={() => setAddOpen(true)} />
        </div>

        <ProjectStatCards
          totalRunCount={project.runCount ?? 0}
          runs={runsQ.data ?? []}
          gitStatus={gitStatusQ.data}
          lastRunAt={project.lastRunAt}
        />

        <div className="flex flex-wrap gap-[16px] items-stretch">
          <ProjectRecentRuns projectId={id} />
          <div className="flex-1 min-w-[280px] flex flex-col gap-[16px]">
            <ProjectEnvironmentCard
              projectId={id}
              accountId={project.meta.accountId}
              githubAccountId={project.meta.githubAccountId}
            />
            <ProjectMemoryCard projectId={id} memory={project.memory} />
          </div>
        </div>

        <ProjectBackupCard
          projectName={project.meta.name}
          includeHistory={backup.includeHistory}
          onIncludeHistoryChange={backup.setIncludeHistory}
          onExport={() => void backup.onExport()}
          importing={backup.importing}
          importStatus={backup.importStatus}
          fileInputRef={backup.fileRef}
          onImportFile={(e) => void backup.onImportFile(e)}
        />

        <ProjectDangerZone
          rosterCount={rosterAgentIds.length}
          cwdOrName={project.meta.cwd ?? project.meta.name}
          pending={danger.pendingDanger}
          working={danger.dangerWorking}
          onRequest={danger.setPendingDanger}
          onCancel={() => danger.setPendingDanger(null)}
          onConfirm={() => void danger.onConfirm()}
        />
      </div>
    </>
  );
}
