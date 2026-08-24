// GET /api/projects/<id>/git-status — summarize the project's git working tree
// (branch, +/- churn, changed-file count, ahead/behind) for the Source Control badge.
// Returns { isGit: false } for a non-git repo or a missing/relative cwd.
import { NextResponse } from "next/server";
import { projects, gitStatus } from "@agent-office/domain/services";
import { notFound, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  const project = projects.readProject(id);
  if (!project) return notFound();

  return NextResponse.json(await gitStatus.readGitStatus(project.meta.cwd));
}
