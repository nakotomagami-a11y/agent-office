/**
 * POST /api/projects/bootstrap
 *
 * Creates a new project directory under the configured projectsRoot,
 * populates it from the bundled template bundles (frontend-react +
 * optionally backend-node or backend-python), runs variable substitution,
 * and `git init`s the result.
 *
 * After the on-disk scaffold lands, this route ALSO registers the project
 * with the project metadata system (writing ~/.claude/projects/<id>/project.md)
 * so the new project shows up in the projects list immediately.
 */

import { NextResponse } from "next/server";
import { projectBootstrap, projects, settings as settingsSvc } from "@agent-office/domain/services";
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

// Optional: GET returns the list of supported framework choices so the UI
// can render them without hardcoding.
export async function GET() {
  return NextResponse.json({
    frontend: [
      { id: "none", label: "None", description: "Backend-only or bare project" },
      { id: "next", label: "Next.js", description: "App Router, server components" },
      { id: "vite", label: "Vite", description: "SPA, fast HMR" },
      { id: "react", label: "React (plain)", description: "Library or widget mounted into a host" },
    ],
    backend: [
      { id: "none", label: "None", description: "Frontend-only project" },
      { id: "node", label: "Node.js (Hono)", description: "Hono + Drizzle + libSQL" },
      { id: "python", label: "Python (FastAPI)", description: "FastAPI + SQLAlchemy + libSQL" },
    ],
    // Whether settings are configured (required for bootstrap)
    settingsReady: settingsSvc.readSettings() !== null,
  });
}
