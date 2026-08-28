"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { useProject } from "@/modules/projects/hooks/use-projects";
import { useActiveProjectStore } from "@/lib/active-project-store";

/** Toggles Activity's scope between the active project and every project.
 * Mirrors the mockup's "This project ⇄" pill (tooltip: "Switch scope"). */
export function ActivityScopePill({ projectId }: { projectId?: string }) {
  const router = useRouter();
  const activeId = useActiveProjectStore((s) => s.id);
  const { data: project } = useProject(projectId ?? null);

  const target = projectId ? undefined : activeId ?? undefined;
  const disabled = !projectId && !activeId;

  return (
    <button
      type="button"
      title="Switch scope"
      disabled={disabled}
      onClick={() => router.push(target ? `${PAGE_ROUTES.activity}?project=${target}` : PAGE_ROUTES.activity)}
      className="inline-flex items-center gap-[7px] px-[11px] py-[6px] rounded-[10px] bg-card-2 border border-edge text-[11.5px] font-semibold text-txt-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:border-acc-line enabled:cursor-pointer"
    >
      <span className="w-[6px] h-[6px] rounded-full bg-acc shrink-0" />
      <span className="whitespace-nowrap">{projectId ? project?.meta.name ?? "This project" : "All projects"}</span>
      <Icon name="refresh" size={11} className="text-txt-4" />
    </button>
  );
}
