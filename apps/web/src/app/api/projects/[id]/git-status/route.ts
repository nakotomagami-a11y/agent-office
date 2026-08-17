import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { isAbsolute } from "node:path";
import { projects } from "@agent-office/domain/services";
import { notFound, validateIdParam } from "@/lib/api-helpers";

const execAsync = promisify(exec);

type Params = { params: Promise<{ id: string }> };

export interface GitStatus {
  isGit: boolean;
  branch?: string;
  added: number;
  removed: number;
  filesChanged: number;
  ahead: number;
  behind: number;
}

async function git(cmd: string, cwd: string): Promise<string> {
  const { stdout } = await execAsync(cmd, { cwd, timeout: 5000 });
  return stdout.trim();
}

export async function GET(_req: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  const project = projects.readProject(id);
  if (!project) return notFound();

  const cwd = project.meta.cwd;
  if (!cwd || !isAbsolute(cwd)) {
    return NextResponse.json<GitStatus>({ isGit: false, added: 0, removed: 0, filesChanged: 0, ahead: 0, behind: 0 });
  }

  const [branchR, diffR, statusR, aheadR, behindR] = await Promise.allSettled([
    git("git rev-parse --abbrev-ref HEAD", cwd),
    git("git diff --shortstat HEAD", cwd),
    git("git status --porcelain --untracked-files=all", cwd),
    git("git rev-list @{u}..HEAD --count", cwd),
    git("git rev-list HEAD..@{u} --count", cwd),
  ]);

  if (branchR.status === "rejected") {
    // Not a git repo
    return NextResponse.json<GitStatus>({ isGit: false, added: 0, removed: 0, filesChanged: 0, ahead: 0, behind: 0 });
  }

  // Line churn (+/-) comes from `git diff`; the changed-FILE count comes from
  // `git status --porcelain` (one line per file, incl. untracked) so it matches
  // VS Code's Source Control badge instead of diff's tracked-only file count.
  let added = 0, removed = 0;
  if (diffR.status === "fulfilled" && diffR.value) {
    const m1 = diffR.value.match(/(\d+) insertion/);
    const m2 = diffR.value.match(/(\d+) deletion/);
    if (m1) added = parseInt(m1[1]!);
    if (m2) removed = parseInt(m2[1]!);
  }

  let filesChanged = 0;
  if (statusR.status === "fulfilled") {
    filesChanged = statusR.value ? statusR.value.split("\n").length : 0;
  } else if (diffR.status === "fulfilled" && diffR.value) {
    // Fallback to diff's file count if porcelain somehow failed.
    const m3 = diffR.value.match(/(\d+) file/);
    if (m3) filesChanged = parseInt(m3[1]!);
  }

  const ahead = aheadR.status === "fulfilled" ? (parseInt(aheadR.value) || 0) : 0;
  const behind = behindR.status === "fulfilled" ? (parseInt(behindR.value) || 0) : 0;

  return NextResponse.json<GitStatus>({
    isGit: true,
    branch: branchR.value,
    added,
    removed,
    filesChanged,
    ahead,
    behind,
  });
}
