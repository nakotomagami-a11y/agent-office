// The frontend/backend template choices the project bootstrapper supports. Single
// source of truth for the picker UI (GET /api/projects/bootstrap) — the ids here
// match the `frontend`/`backend` enums in bootstrapProjectSchema.

export interface TemplateChoice {
  id: string;
  label: string;
  description: string;
}

export const FRONTEND_TEMPLATES = [
  { id: "none", label: "None", description: "Backend-only or bare project" },
  { id: "next", label: "Next.js", description: "App Router, server components" },
  { id: "vite", label: "Vite", description: "SPA, fast HMR" },
  { id: "react", label: "React (plain)", description: "Library or widget mounted into a host" },
] as const satisfies readonly TemplateChoice[];

export const BACKEND_TEMPLATES = [
  { id: "none", label: "None", description: "Frontend-only project" },
  { id: "node", label: "Node.js (Hono)", description: "Hono + Drizzle + libSQL" },
  { id: "python", label: "Python (FastAPI)", description: "FastAPI + SQLAlchemy + libSQL" },
] as const satisfies readonly TemplateChoice[];

export type FrontendTemplateId = (typeof FRONTEND_TEMPLATES)[number]["id"];
export type BackendTemplateId = (typeof BACKEND_TEMPLATES)[number]["id"];
