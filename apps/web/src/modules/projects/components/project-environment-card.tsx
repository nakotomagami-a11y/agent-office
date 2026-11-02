"use client";

import { PAGE_ROUTES } from "@/lib/page-routes";
import { ProjectAccountPicker } from "./project-account-picker";
import { ProjectGithubAccountPicker } from "./project-github-account-picker";
import { ProjectSecretsControl } from "./project-secrets-control";
import { EnvHeaderLink } from "./env-control";

export type ProjectEnvironmentCardProps = {
  projectId: string;
  accountId: string | undefined;
  githubAccountId: string | undefined;
};

/** The "Environment" card shell around the three real per-project pickers (Claude account, GitHub, secrets). */
export function ProjectEnvironmentCard({ projectId, accountId, githubAccountId }: ProjectEnvironmentCardProps) {
  return (
    <div className="rounded-[24px] surface-sheen shadow-[var(--lift)] px-[22px] py-[20px]">
      <div className="flex items-center gap-[10px]">
        <span className="text-[16px] font-bold whitespace-nowrap">Environment</span>
        <span className="flex-1" />
        <EnvHeaderLink href={PAGE_ROUTES.settings}>Manage</EnvHeaderLink>
      </div>
      <div className="flex flex-col gap-[9px] mt-[15px]">
        <ProjectAccountPicker projectId={projectId} currentAccountId={accountId} />
        <ProjectGithubAccountPicker projectId={projectId} currentGithubAccountId={githubAccountId} />
        <ProjectSecretsControl projectId={projectId} />
      </div>
    </div>
  );
}
