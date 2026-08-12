"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useGitStatus } from "@/modules/projects/hooks/use-projects";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import type { Project } from "@agent-office/domain/types";

export function ProjectChip({
  projectId,
  project,
}: {
  projectId: string;
  project: Project | undefined;
}) {
  const router = useRouter();
  const gitQ = useGitStatus(projectId, !!project?.meta.cwd);
  const git = gitQ.data;
  const hasBranch = git?.isGit && git.branch;
  const dirty = (git?.filesChanged ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={() => router.push(PAGE_ROUTES.project(projectId))}
      className={cn(
        "inline-flex items-center gap-[6px] h-[30px] px-[10px] rounded-[8px] bg-bg-2 hover:bg-bg-3 border border-transparent hover:border-line text-[13.5px] font-medium text-txt transition-[background,border-color] duration-[120ms] cursor-pointer select-none shrink-0",
        !project && "min-w-[140px]",
      )}
    >
      {project ? (
        <>
          <span className="truncate max-w-[200px]">{project.meta.name}</span>
          {hasBranch && (
            <span
              className={cn(
                "inline-flex items-center gap-[3px] font-mono text-[11.5px] shrink-0",
                dirty ? "text-acc" : "text-txt-4",
              )}
            >
              <Icon name="branch" size={10} />
              {git!.branch}
              {dirty && (
                <span className="text-[10.5px]">·{git!.filesChanged}</span>
              )}
              {(git?.ahead ?? 0) > 0 && (
                <span className="text-[10.5px] text-status-working">↑{git!.ahead}</span>
              )}
              {(git?.behind ?? 0) > 0 && (
                <span className="text-[10.5px] text-[var(--queued)]">↓{git!.behind}</span>
              )}
            </span>
          )}
        </>
      ) : (
        <span className="w-full h-3 rounded bg-bg-3 animate-pulse" />
      )}
    </button>
  );
}
