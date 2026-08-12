// Project bootstrap - creates a new project directory and populates it from
// the bundled templates in `apps/web/starter-data/project-templates/`.
//
// Three template bundles compose into a project:
//   frontend-react/ + (Next | Vite | React variant)  ← always
//   backend-node/                                     ← optional
//   backend-python/                                   ← optional
//
// Each markdown file gets variable substitution. The frontend ARCHITECTURE
// file is the special case: ARCHITECTURE.base.md contains a
// `<!-- FRAMEWORK_SPECIFIC -->` marker that's replaced with the body of the
// matching ARCHITECTURE.<framework>.md.
//
// Output layout for a fullstack project:
//
//   <projectsRoot>/<slug>/
//     CLAUDE.md           ← top-level project index
//     DECISIONS.md
//     PLAN.md
//     README.md
//     frontend/
//       CLAUDE.md
//       ARCHITECTURE.md   (merged base + variant)
//       DECISIONS.md
//       PLAN.md
//       README.md
//       docs/*
//     backend/
//       CLAUDE.md
//       ARCHITECTURE.md
//       DECISIONS.md
//       PLAN.md
//       README.md
//       docs/*

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { expandTilde } from "./paths";
import { readSettings, slugify, scanProjects } from "./settings";
import { ensureDir } from "./fs-atomic";
import { log } from "./log";

export type FrontendChoice = "none" | "next" | "vite" | "react";
export type BackendChoice = "none" | "node" | "python";

export interface BootstrapInput {
  /** Display name. Slugified into the folder name. */
  name: string;
  /** Optional explicit slug. Falls back to slugify(name). */
  slug?: string;
  /** One-liner description. Optional. */
  description?: string;
  /** Frontend framework. Required - all projects have a frontend. */
  frontend: FrontendChoice;
  /** Backend framework. Optional. */
  backend: BackendChoice;
  /** Run `git init` in the new project root. Default: true. */
  initGit?: boolean;
}

export interface BootstrapResult {
  /** Final slug used. */
  slug: string;
  /** Absolute path of the created project root. */
  path: string;
  /** Files written, relative to project root. */
  written: string[];
  /** Whether `git init` actually ran successfully. */
  gitInitialized: boolean;
}

interface TemplateResolution {
  /** Absolute path to the project-templates directory. */
  templatesDir: string;
}

/**
 * Find the bundled templates directory. Mirrors the resolution strategy used
 * by `/api/starter/agents` so dev (run from `apps/web`) and prod (run from
 * repo root) both work.
 */
function resolveTemplatesDir(): TemplateResolution | null {
  const candidates = [
    process.env["AGENT_OFFICE_STARTER_DATA"],
    process.cwd(),
    join(process.cwd(), "apps", "web"),
  ].filter(Boolean) as string[];

  for (const base of candidates) {
    const candidate = join(base, "starter-data", "project-templates");
    try {
      if (existsSync(candidate) && statSync(candidate).isDirectory()) {
        return { templatesDir: candidate };
      }
    } catch {
      /* keep trying */
    }
    // Some callers pass paths that already include starter-data
    const alt = join(base, "project-templates");
    try {
      if (existsSync(alt) && statSync(alt).isDirectory()) {
        return { templatesDir: alt };
      }
    } catch {
      /* keep trying */
    }
  }
  return null;
}

interface SubstitutionVars {
  PROJECT_NAME: string;
  DATE: string;
  FRONTEND: string;
  BACKEND: string;
}

function frontendLabel(c: FrontendChoice): string {
  switch (c) {
    case "none": return "none";
    case "next": return "Next.js";
    case "vite": return "Vite";
    case "react": return "React (plain)";
  }
}

function backendLabel(c: BackendChoice): string {
  switch (c) {
    case "none": return "none";
    case "node": return "Node.js (Hono)";
    case "python": return "Python (FastAPI)";
  }
}

function substitute(text: string, vars: SubstitutionVars): string {
  return text
    .replace(/\{\{PROJECT_NAME\}\}/g, vars.PROJECT_NAME)
    .replace(/\{\{DATE\}\}/g, vars.DATE)
    .replace(/\{\{FRONTEND\}\}/g, vars.FRONTEND)
    .replace(/\{\{BACKEND\}\}/g, vars.BACKEND);
}

/**
 * Recursively list all files under `dir`, returning paths relative to it.
 * Excludes any ARCHITECTURE.<variant>.md files - those are merged separately.
 */
function listTemplateFiles(dir: string, relPrefix = ""): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = relPrefix ? join(relPrefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      out.push(...listTemplateFiles(join(dir, entry.name), relPath));
    } else {
      out.push(relPath);
    }
  }
  return out;
}

const FRONTEND_VARIANTS: Record<Exclude<FrontendChoice, "none">, string> = {
  next: "ARCHITECTURE.next.md",
  vite: "ARCHITECTURE.vite.md",
  react: "ARCHITECTURE.react.md",
};

const ALL_VARIANT_FILES = new Set(Object.values(FRONTEND_VARIANTS));
const FRAMEWORK_MARKER = "<!-- FRAMEWORK_SPECIFIC -->";

/**
 * Write the frontend bundle to `targetDir`. Handles the base + variant merge.
 */
function writeFrontend(
  templatesDir: string,
  targetDir: string,
  frontend: Exclude<FrontendChoice, "none">,
  vars: SubstitutionVars,
): string[] {
  const written: string[] = [];
  const sourceDir = join(templatesDir, "frontend-react");
  if (!existsSync(sourceDir)) {
    throw new Error("frontend-react template bundle missing");
  }

  // Build the merged ARCHITECTURE.md from base + variant
  const baseFile = join(sourceDir, "ARCHITECTURE.base.md");
  const variantFile = join(sourceDir, FRONTEND_VARIANTS[frontend]);
  if (!existsSync(baseFile)) throw new Error("ARCHITECTURE.base.md missing");
  if (!existsSync(variantFile)) throw new Error(`${FRONTEND_VARIANTS[frontend]} missing`);

  const baseText = readFileSync(baseFile, "utf8");
  const variantText = readFileSync(variantFile, "utf8");
  let merged: string;
  if (baseText.includes(FRAMEWORK_MARKER)) {
    merged = baseText.replace(FRAMEWORK_MARKER, variantText.trim());
  } else {
    // Fall back to append if marker is missing
    merged = `${baseText.trimEnd()}\n\n${variantText.trim()}\n`;
  }
  merged = substitute(merged, vars);

  const archDest = join(targetDir, "ARCHITECTURE.md");
  ensureDir(dirname(archDest));
  writeFileSync(archDest, merged);
  written.push("ARCHITECTURE.md");

  // Copy all other files except the base and variant markdowns
  for (const rel of listTemplateFiles(sourceDir)) {
    if (rel === "ARCHITECTURE.base.md") continue;
    if (ALL_VARIANT_FILES.has(rel)) continue;
    const src = join(sourceDir, rel);
    const dest = join(targetDir, rel);
    ensureDir(dirname(dest));
    const text = readFileSync(src, "utf8");
    writeFileSync(dest, substitute(text, vars));
    written.push(rel);
  }

  // Append the shared DECISIONS template if not already present
  const decisionsDest = join(targetDir, "DECISIONS.md");
  if (!existsSync(decisionsDest)) {
    const sharedDecisions = join(templatesDir, "_shared", "DECISIONS.template.md");
    if (existsSync(sharedDecisions)) {
      const text = readFileSync(sharedDecisions, "utf8");
      writeFileSync(decisionsDest, substitute(text, vars));
      written.push("DECISIONS.md");
    }
  }

  return written;
}

/**
 * Write a backend bundle (node or python) to `targetDir`. No variant merge.
 */
function writeBackend(
  templatesDir: string,
  targetDir: string,
  backend: Exclude<BackendChoice, "none">,
  vars: SubstitutionVars,
): string[] {
  const written: string[] = [];
  const bundleName = backend === "node" ? "backend-node" : "backend-python";
  const sourceDir = join(templatesDir, bundleName);
  if (!existsSync(sourceDir)) {
    throw new Error(`${bundleName} template bundle missing`);
  }

  for (const rel of listTemplateFiles(sourceDir)) {
    const src = join(sourceDir, rel);
    const dest = join(targetDir, rel);
    ensureDir(dirname(dest));
    const text = readFileSync(src, "utf8");
    writeFileSync(dest, substitute(text, vars));
    written.push(rel);
  }

  // DECISIONS
  const decisionsDest = join(targetDir, "DECISIONS.md");
  if (!existsSync(decisionsDest)) {
    const sharedDecisions = join(templatesDir, "_shared", "DECISIONS.template.md");
    if (existsSync(sharedDecisions)) {
      const text = readFileSync(sharedDecisions, "utf8");
      writeFileSync(decisionsDest, substitute(text, vars));
      written.push("DECISIONS.md");
    }
  }

  return written;
}

/**
 * Write a top-level CLAUDE.md that points at the sub-projects. Only used when
 * a project has both a frontend and a backend (or when wanting a project-root
 * orientation file).
 */
function writeRootClaude(rootDir: string, vars: SubstitutionVars, hasFrontend: boolean, hasBackend: boolean): void {
  const parts: string[] = [];
  parts.push(`# ${vars.PROJECT_NAME}`);
  parts.push("");
  parts.push(`Bootstrapped from agent-office templates on ${vars.DATE}.`);
  parts.push("");
  parts.push("## Layout");
  parts.push("");
  if (hasFrontend) {
    parts.push("- `frontend/` - " + vars.FRONTEND + " app. See `frontend/CLAUDE.md` for house rules.");
  }
  if (hasBackend) {
    parts.push("- `backend/` - " + vars.BACKEND + ". See `backend/CLAUDE.md` for house rules.");
  }
  parts.push("");
  parts.push("## How to work in this repo");
  parts.push("");
  if (hasFrontend) {
    parts.push("- Frontend changes → cwd into `frontend/`. Claude reads `frontend/CLAUDE.md`.");
  }
  if (hasBackend) {
    parts.push("- Backend changes → cwd into `backend/`. Claude reads `backend/CLAUDE.md`.");
  }
  if (hasFrontend && hasBackend) {
    parts.push("- Cross-cutting changes → start at the repo root and link both CLAUDE.md files.");
  }
  parts.push("");
  parts.push("## Out of scope");
  parts.push("");
  parts.push("- _add what this project does NOT do_");
  parts.push("");
  writeFileSync(join(rootDir, "CLAUDE.md"), parts.join("\n"));
}

function writeRootReadme(rootDir: string, vars: SubstitutionVars, hasFrontend: boolean, hasBackend: boolean): void {
  const parts: string[] = [];
  parts.push(`# ${vars.PROJECT_NAME}`);
  parts.push("");
  parts.push("_One-sentence description goes here._");
  parts.push("");
  parts.push("## Structure");
  parts.push("");
  if (hasFrontend) parts.push(`- \`frontend/\` - ${vars.FRONTEND}`);
  if (hasBackend) parts.push(`- \`backend/\` - ${vars.BACKEND}`);
  parts.push("");
  parts.push("## Run");
  parts.push("");
  parts.push("```bash");
  if (hasFrontend) {
    parts.push("cd frontend && pnpm install && pnpm dev");
  }
  if (hasBackend && vars.BACKEND.startsWith("Node")) {
    if (hasFrontend) parts.push("# in another terminal:");
    parts.push("cd backend && pnpm install && pnpm dev");
  } else if (hasBackend && vars.BACKEND.startsWith("Python")) {
    if (hasFrontend) parts.push("# in another terminal:");
    parts.push("cd backend && uv sync && uv run uvicorn app.main:app --reload");
  }
  parts.push("```");
  parts.push("");
  writeFileSync(join(rootDir, "README.md"), parts.join("\n"));
}

function runGitInit(rootDir: string): boolean {
  try {
    execSync("git init -q", { cwd: rootDir, stdio: "ignore" });
    // Also create a basic .gitignore
    const gitignore = [
      "node_modules/",
      "dist/",
      "build/",
      ".next/",
      ".env",
      ".env.local",
      "*.local.db",
      "local.db",
      "__pycache__/",
      "*.pyc",
      ".venv/",
      ".pytest_cache/",
      ".mypy_cache/",
      "",
    ].join("\n");
    const gitignorePath = join(rootDir, ".gitignore");
    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, gitignore);
    }
    return true;
  } catch (e) {
    log.warn("project_bootstrap.git_init_failed", { err: String(e) });
    return false;
  }
}

export function bootstrapProject(input: BootstrapInput): BootstrapResult {
  const settings = readSettings();
  if (!settings) throw new Error("first-run setup not complete");

  const slug = input.slug?.trim() || slugify(input.name);
  if (!slug) throw new Error("name produces empty slug");

  const root = expandTilde(settings.projectsRoot);
  const projectPath = join(root, slug);
  if (existsSync(projectPath)) {
    throw new Error(`project folder already exists at ${projectPath}`);
  }

  const resolution = resolveTemplatesDir();
  if (!resolution) {
    throw new Error("project-templates bundle not found");
  }
  const { templatesDir } = resolution;

  const vars: SubstitutionVars = {
    PROJECT_NAME: input.name,
    DATE: new Date().toISOString().slice(0, 10),
    FRONTEND: frontendLabel(input.frontend),
    BACKEND: backendLabel(input.backend),
  };

  ensureDir(projectPath);

  const hasFrontend = input.frontend !== "none";
  const hasBackend = input.backend !== "none";
  const written: string[] = [];

  // Frontend (optional)
  if (hasFrontend && input.frontend !== "none") {
    const frontendDir = join(projectPath, "frontend");
    ensureDir(frontendDir);
    const feFiles = writeFrontend(templatesDir, frontendDir, input.frontend, vars);
    written.push(...feFiles.map((f) => join("frontend", f)));
  }

  // Backend (optional)
  if (input.backend === "node" || input.backend === "python") {
    const backendDir = join(projectPath, "backend");
    ensureDir(backendDir);
    const beFiles = writeBackend(templatesDir, backendDir, input.backend, vars);
    written.push(...beFiles.map((f) => join("backend", f)));
  }

  // Root-level CLAUDE.md + README.md
  writeRootClaude(projectPath, vars, hasFrontend, hasBackend);
  written.push("CLAUDE.md");
  writeRootReadme(projectPath, vars, hasFrontend, hasBackend);
  written.push("README.md");

  // Root-level DECISIONS.md from shared template (so the project root has its own ADR log)
  const sharedDecisions = join(templatesDir, "_shared", "DECISIONS.template.md");
  if (existsSync(sharedDecisions)) {
    const text = readFileSync(sharedDecisions, "utf8");
    writeFileSync(join(projectPath, "DECISIONS.md"), substitute(text, vars));
    written.push("DECISIONS.md");
  }

  // Root-level PLAN.md - copy from frontend template
  const planSrc = join(templatesDir, "frontend-react", "PLAN.md");
  if (existsSync(planSrc)) {
    const text = readFileSync(planSrc, "utf8");
    writeFileSync(join(projectPath, "PLAN.md"), substitute(text, vars));
    written.push("PLAN.md");
  }

  // Git init
  const initGit = input.initGit ?? true;
  const gitInitialized = initGit ? runGitInit(projectPath) : false;

  // Trigger a project scan so the new folder shows up in the projects list
  // (the existing createProject flow does this via project metadata; we don't
  // create project metadata here since the wizard hands off to it after).
  scanProjects(settings.projectsRoot, settings.excluded);

  log.info("project_bootstrap.done", {
    slug,
    frontend: input.frontend,
    backend: input.backend,
    fileCount: written.length,
    gitInitialized,
  });

  if (input.description !== undefined) {
    // surface to caller via result; persisted by the API layer when it calls
    // createProject with the same slug/description after bootstrap.
  }

  return { slug, path: projectPath, written, gitInitialized };
}
