"use client";

import Link from "next/link";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { ProjectAccountPicker } from "./project-account-picker";
import { ProjectGithubAccountPicker } from "./project-github-account-picker";
import { ProjectSecretsControl } from "./project-secrets-control";

export type ProjectEnvironmentCardProps = {
  projectId: string;
  accountId: string | undefined;
  githubAccountId: string | undefined;
};

/**
 * Wraps the three real per-project pickers (Claude account, GitHub account,
 * Secrets) in the V3 "Environment" card shell. The pickers themselves already
 * do the real work — this is layout only.
 */
export function ProjectEnvironmentCard({ projectId, accountId, githubAccountId }: ProjectEnvironmentCardProps) {
  return (
    <div className="rounded-[24px] surface-sheen shadow-[var(--lift)] px-[22px] py-[20px]">
      <div className="flex items-center gap-[10px]">
        <span className="text-[16px] font-bold whitespace-nowrap">Environment</span>
        <span className="flex-1" />
        <Link href={PAGE_ROUTES.settings} className="text-[12.5px] font-semibold text-acc whitespace-nowrap">
          Manage
        </Link>
      </div>
      <div className="flex flex-col gap-[9px] mt-[15px]">
        <ProjectAccountPicker projectId={projectId} currentAccountId={accountId} />
        <ProjectGithubAccountPicker projectId={projectId} currentGithubAccountId={githubAccountId} />
        <ProjectSecretsControl projectId={projectId} />
      </div>
    </div>
  );
}
