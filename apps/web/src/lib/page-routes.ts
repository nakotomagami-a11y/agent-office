/** Every UI page path. Never hardcode one elsewhere. */
export const PAGE_ROUTES = {
  agents: "/agents",
  agent: (id: string) => `/agents/${encodeURIComponent(id)}`,
  agentEdit: (id: string) => `/agents/${encodeURIComponent(id)}/edit`,
  agentNew: "/agents/new",
  projects: "/projects",
  project: (id: string) => `/projects/${encodeURIComponent(id)}`,
  skills: "/skills",
  memory: "/memory",
  settings: "/settings",
  /** Settings opened on the AI provider tab, for error cards that say how to fix a provider. */
  settingsProvider: "/settings?tab=provider",
  analytics: "/analytics",
  schedules: "/schedules",
  docs: "/docs",
} as const;
