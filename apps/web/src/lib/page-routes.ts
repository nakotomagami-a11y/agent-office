/** Every UI page path. Never hardcode one elsewhere. */
export const PAGE_ROUTES = {
  /** Landing page / office island — the root route. Use this; there is no separate `home` alias. */
  office: "/",
  agents: "/agents",
  agent: (id: string) => `/agents/${encodeURIComponent(id)}`,
  agentEdit: (id: string) => `/agents/${encodeURIComponent(id)}/edit`,
  agentNew: "/agents/new",
  projects: "/projects",
  project: (id: string) => `/projects/${encodeURIComponent(id)}`,
  skills: "/skills",
  memory: "/memory",
  settings: "/settings",
  activity: "/activity",
  analytics: "/analytics",
  schedules: "/schedules",
  docs: "/docs",
} as const;
