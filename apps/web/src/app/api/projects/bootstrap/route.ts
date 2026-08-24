// POST /api/projects/bootstrap — scaffold a new project under projectsRoot from the
// bundled templates (frontend-react + optional backend-node/python), run variable
// substitution and `git init`, then register it in the project metadata
// (~/.claude/projects/<id>/project.md) so it shows in the list immediately.
import { NextResponse } from "next/server";
import { projectBootstrap, projects, settings as settingsSvc } from "@agent-office/domain/services";
import { FRONTEND_TEMPLATES, BACKEND_TEMPLATES } from "@agent-office/domain/config/project-templates";
import { validateBody } from "@/lib/validation";
import { bootstrapProjectSchema } from "@/lib/validation-schemas";
import { tryService } from "@/lib/api-helpers";

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(bootstrapProjectSchema, raw);
  if (error) return error;

  return tryService(async () => {
    const result = projectBootstrap.bootstrapProject({
      name: data.name,
      slug: data.slug,
      description: data.description,
      frontend: data.frontend,
      backend: data.backend,
      initGit: data.initGit ?? true,
    });

    // Register the project with the metadata system so it appears in the
    // projects list. Use the same slug the bootstrap step picked.
    const slug = result.slug;
    try {
      const project = projects.createProject({
        id: slug,
        name: data.name,
        description: data.description,
      });
      return {
        slug,
        path: result.path,
        fileCount: result.written.length,
        gitInitialized: result.gitInitialized,
        project,
      };
    } catch (e) {
      // Project may already exist as a metadata record (race) - that's fine,
      // the scaffold is on disk. Surface the bootstrap result anyway.
      return {
        slug,
        path: result.path,
        fileCount: result.written.length,
        gitInitialized: result.gitInitialized,
        project: null,
        warning: e instanceof Error ? e.message : String(e),
      };
    }
  });
}

// GET returns the supported framework choices (from the project-templates config)
// so the UI renders the picker without hardcoding, plus whether settings are ready.
export async function GET() {
  return NextResponse.json({
    frontend: FRONTEND_TEMPLATES,
    backend: BACKEND_TEMPLATES,
    settingsReady: settingsSvc.readSettings() !== null,
  });
}
