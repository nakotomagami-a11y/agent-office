"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { PlanetEditorModal } from "@/components/ui/planet-editor-modal";
import { useGitStatus, useProject, useUpdateProject } from "../hooks/use-projects";
import { useOfficeAgents } from "@/modules/office/hooks/use-office-agents";
import { useProjectDetailActions } from "../hooks/use-project-detail-actions";
import { AddAgentModal } from "./add-agent-modal";
import { ProjectHero } from "./project-hero";
import { ProjectLiveRuns } from "./project-live-runs";
import { ProjectActivityCard } from "./project-activity-card";
import { ProjectWorkingTreeCard } from "./project-working-tree-card";
import { ProjectRecentRuns } from "./project-recent-runs";
import { ProjectEnvironmentCard } from "./project-environment-card";
import { ProjectBackupCard } from "./project-backup-card";
import { ProjectDangerZone } from "./project-danger-zone";

export type ProjectDetailProps = { id: string };

/**
 * V3 project dashboard. There is no separate "Project" page header here — the
 * cosmic hero card IS the header, confirmed against the raw V3 mockup (no H1
 * sits above the two-column grid). Every stat below is derived from real
 * data: the project's activity endpoint, `useGitStatus`, and the project's own `memory`.
 */
export function ProjectDetail({ id }: ProjectDetailProps) {
  const t = useTranslations();
  const projectQ = useProject(id);
  const updateMut = useUpdateProject();
  const { agents: allAgents } = useOfficeAgents();
  const gitStatusQ = useGitStatus(id, !!projectQ.data?.meta.cwd);
  const { backup, danger } = useProjectDetailActions(id, projectQ.data, () => projectQ.refetch());

  const [planetEditorOpen, setPlanetEditorOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const project = projectQ.data;
  const { mutateAsync: updateAsync } = updateMut;
  const saveName = useCallback((name: string) => updateAsync({ id, patch: { meta: { name } } }), [updateAsync, id]);

  if (projectQ.isLoading) return null;
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
        onSave={(cfg) => updateMut.mutate({ id, patch: { meta: { planet: cfg } } })}
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
            onSaveName={saveName}
          />
          <ProjectLiveRuns projectId={id} roster={project.meta.roster} agents={allAgents} onSummonAnother={() => setAddOpen(true)} />
        </div>

        <div className="flex flex-wrap gap-[16px]">
          <ProjectActivityCard projectId={id} />
          <ProjectWorkingTreeCard gitStatus={gitStatusQ.data} loading={gitStatusQ.isLoading} hasFolder={!!project.meta.cwd} lastRunAt={project.lastRunAt} />
        </div>

        <div className="flex flex-wrap gap-[16px] items-stretch">
          <ProjectRecentRuns projectId={id} />
          <div className="flex-1 min-w-[280px] flex flex-col gap-[16px]">
            <ProjectEnvironmentCard
              projectId={id}
              accountId={project.meta.accountId}
              githubAccountId={project.meta.githubAccountId}
            />
          </div>
        </div>

        <ProjectBackupCard
          onExport={() => void backup.onExport()}
          exportFileName={backup.exportFileName}
          exportError={backup.exportError}
          exported={backup.exported}
          importing={backup.importing}
          importStatus={backup.importStatus}
          fileInputRef={backup.fileRef}
          onImportFile={(e) => void backup.onImportFile(e)}
          onDropFile={(file) => void backup.onDropFile(file)}
        />

        <ProjectDangerZone
          projectName={project.meta.name}
          sessionAgentIds={project.meta.roster.map((r) => r.agentId)}
          cwdOrName={project.meta.cwd ?? project.meta.name}
          pending={danger.pendingDanger}
          working={danger.dangerWorking}
          conflict={danger.dangerConflict}
          error={danger.dangerError}
          onRequest={danger.setPendingDanger}
          onCancel={() => danger.setPendingDanger(null)}
          onConfirm={(work) => void danger.onConfirm(work)}
        />
      </div>
    </>
  );
}
