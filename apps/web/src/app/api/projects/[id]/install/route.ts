import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { projects } from "@agent-office/domain/services";
import { validateIdParam, notFound } from "@/lib/api-helpers";
import { detectPackageManager, resolvePackageDirs, PM_PATH_SETUP } from "@/lib/server/project-runtime";

const execFileAsync = promisify(execFile);

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  const project = projects.readProject(id);
  if (!project) return notFound();

  const cwd = project.meta.cwd;
  if (!cwd || !existsSync(cwd)) {
    return NextResponse.json({ error: "Working directory not found" }, { status: 400 });
  }

  // Install where package.json actually lives (root, or frontend/backend/… for
  // split projects) — not the bare project root, which may have none.
  const dirs = resolvePackageDirs(cwd);
  if (dirs.length === 0) {
    return NextResponse.json(
      { error: "No package.json found in this project or its frontend/backend folders." },
      { status: 400 },
    );
  }

  const installed: Array<{ dir: string; pm: string }> = [];
  for (const dir of dirs) {
    const pm = detectPackageManager(dir);
    try {
      // On Windows bash isn't available; run the PM directly (system PATH is
      // sufficient since Windows PM installs register globally). On Unix we
      // wrap in bash -lc so the nvm/pnpm/bun PATH bootstrap applies — a
      // GUI-launched app otherwise can't find the package manager.
      if (process.platform === "win32") {
        await execFileAsync(pm, ["install"], {
          cwd: dir,
          timeout: 300_000,
          maxBuffer: 10 * 1024 * 1024,
          shell: true, // needed so cmd.exe resolves .cmd shims (npm.cmd, pnpm.cmd)
        });
      } else {
        await execFileAsync("bash", ["-lc", `${PM_PATH_SETUP}${pm} install`], {
          cwd: dir,
          timeout: 300_000,
          maxBuffer: 10 * 1024 * 1024,
        });
      }
      installed.push({ dir: basename(dir), pm });
    } catch (err: unknown) {
      const e = err as { stderr?: string; stdout?: string; message?: string };
      const detail = (e.stderr || e.stdout || e.message || "Install failed").trim().slice(-2000);
      return NextResponse.json(
        { error: `${pm} install failed in ${basename(dir)}:\n${detail}`, installed },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, installed });
}
