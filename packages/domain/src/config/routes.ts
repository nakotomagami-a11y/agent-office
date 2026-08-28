/**
 * Centralized URL config - every route, page, and external endpoint string
 * lives here. Never hardcode URLs anywhere else.
 */

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

export const API_ROUTES = {
  health: "/api/health",
  templates: "/api/templates",
  account: "/api/account",
  clipboardImage: "/api/clipboard-image",
  devSeed: "/api/dev/seed",

  agents: "/api/agents",
  agentsBulk: "/api/agents/bulk",
  agent: (id: string) => `/api/agents/${encodeURIComponent(id)}`,
  agentBody: (id: string) => `/api/agents/${encodeURIComponent(id)}/body`,
  agentMemory: (id: string) => `/api/agents/${encodeURIComponent(id)}/memory`,
  agentPrompts: (id: string) => `/api/agents/${encodeURIComponent(id)}/prompts`,
  agentUploads: (id: string) => `/api/agents/${encodeURIComponent(id)}/uploads`,
  agentUploadFile: (id: string, filename: string) =>
    `/api/agents/${encodeURIComponent(id)}/uploads/${encodeURIComponent(filename)}`,

  memoryGlobal: "/api/memory/global",

  uiSettings: "/api/ui-settings",
  transcripts: "/api/transcripts",
  drafts: "/api/drafts",

  projects: "/api/projects",
  projectsBootstrap: "/api/projects/bootstrap",
  project: (id: string) => `/api/projects/${encodeURIComponent(id)}`,
  projectMemory: (id: string) => `/api/projects/${encodeURIComponent(id)}/memory`,
  projectRoster: (id: string) => `/api/projects/${encodeURIComponent(id)}/roster`,
  projectRosterItem: (projectId: string, instanceId: string) =>
    `/api/projects/${encodeURIComponent(projectId)}/roster/${encodeURIComponent(instanceId)}`,
  projectRosterRepairWorktree: (projectId: string, instanceId: string) =>
    `/api/projects/${encodeURIComponent(projectId)}/roster/${encodeURIComponent(instanceId)}/repair-worktree`,
  projectUploads: (id: string) => `/api/projects/${encodeURIComponent(id)}/uploads`,
  projectUploadFile: (id: string, filename: string) =>
    `/api/projects/${encodeURIComponent(id)}/uploads/${encodeURIComponent(filename)}`,
  projectGitStatus: (id: string) => `/api/projects/${encodeURIComponent(id)}/git-status`,
  projectDev: (id: string) => `/api/projects/${encodeURIComponent(id)}/dev`,
  projectBuild: (id: string) => `/api/projects/${encodeURIComponent(id)}/build`,
  projectInstall: (id: string) => `/api/projects/${encodeURIComponent(id)}/install`,
  projectOpenFolder: (id: string) => `/api/projects/${encodeURIComponent(id)}/open-folder`,
  projectClearCache: (id: string) => `/api/projects/${encodeURIComponent(id)}/clear-cache`,
  projectFolder: (id: string) => `/api/projects/${encodeURIComponent(id)}/folder`,

  processes: "/api/processes",
  process: (pid: number) => `/api/processes/${pid}`,
  processLogs: (pid: number) => `/api/processes/${pid}/logs`,
  processStdin: (pid: number) => `/api/processes/${pid}/stdin`,

  flutterRun: "/api/flutter/run",
  flutterMirror: "/api/flutter/mirror",

  saveExport: "/api/save/export",
  saveImport: "/api/save/import",

  skillsRegistry: "/api/skills/registry",
  skillsInstalled: "/api/skills/installed",
  skillsSources: "/api/skills/sources",
  skillsUpdates: "/api/skills/updates",
  skillsInstall: "/api/skills/install",
  skillsCreate: "/api/skills/create",
  skillsImport: "/api/skills/import",
  skillsManifest: "/api/skills/manifest",
  skillsCompatibility: "/api/skills/compatibility",
  skillsIcons: "/api/skills/icons",
  skill: (name: string) => `/api/skills/${encodeURIComponent(name)}`,
  skillCustomization: (name: string) => `/api/skills/${encodeURIComponent(name)}/customization`,
  skillUpdate: (name: string) => `/api/skills/${encodeURIComponent(name)}/update`,

  runs: "/api/runs",
  runsAbortAll: "/api/runs/abort-all",
  run: (id: string) => `/api/runs/${encodeURIComponent(id)}`,
  runStream: (id: string) => `/api/runs/${encodeURIComponent(id)}/stream`,
  runAbort: (id: string) => `/api/runs/${encodeURIComponent(id)}/abort`,
  runChildren: (id: string) => `/api/runs/${encodeURIComponent(id)}/children`,
  runTree: (id: string) => `/api/runs/${encodeURIComponent(id)}/tree`,

  summon: "/api/summon",
  schedules: "/api/schedules",
  schedule: (id: string) => `/api/schedules/${encodeURIComponent(id)}`,
  scheduleRun: (id: string) => `/api/schedules/${encodeURIComponent(id)}/run`,
  broadcast: "/api/broadcast",

  settings: "/api/settings",
  settingsScan: "/api/settings/scan",
  userAnalysis: "/api/user-analysis",

  workflows: "/api/workflows",
  workflowById: (id: string) => `/api/workflows/${id}`,
  workflowUse: (id: string) => `/api/workflows/${id}/use`,
  workflowsBulk: "/api/workflows/bulk",

  agentDocs: "/api/agent-docs",
  agentDoc: (owner: string, slug: string) =>
    `/api/agent-docs/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}`,

  cleanup: (kind: string) => `/api/cleanup/${kind}`,

  accounts: "/api/accounts",
  accountById: (id: string) => `/api/accounts/${encodeURIComponent(id)}`,
  accountStatus: (id: string) => `/api/accounts/${encodeURIComponent(id)}/status`,
  accountLogin: (id: string) => `/api/accounts/${encodeURIComponent(id)}/login`,
  accountLoginCode: (id: string) => `/api/accounts/${encodeURIComponent(id)}/login/code`,

  githubAccounts: "/api/github-accounts",
  githubAccountById: (id: string) => `/api/github-accounts/${encodeURIComponent(id)}`,
  githubAccountStatus: (id: string) => `/api/github-accounts/${encodeURIComponent(id)}/status`,

  secrets: "/api/secrets",
  secretById: (id: string) => `/api/secrets/${encodeURIComponent(id)}`,
  secretTest: (id: string) => `/api/secrets/${encodeURIComponent(id)}/test`,
  projectSecrets: (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/secrets`,
  projectSecretById: (projectId: string, secretId: string) =>
    `/api/projects/${encodeURIComponent(projectId)}/secrets/${encodeURIComponent(secretId)}`,

  analyticsPerAccount: "/api/analytics/per-account",
  analyticsSummary: "/api/analytics/summary",
  analyticsPage: "/api/analytics/page",
} as const;

/** This app's own GitHub repo ("owner/name") — the release / self-update source. */
export const APP_REPO = "nakotomagami-a11y/agent-office";

/**
 * External endpoints (git registries, release feeds, etc). When new external
 * integrations are added, define their builders here — never hardcode a URL in
 * a feature file. Builders take a combined `"owner/repo"` source string.
 */
export const EXTERNAL_API = {
  github: {
    /** Recursive file tree of a repo at a ref. */
    gitTree: (source: string, ref: string) =>
      `https://api.github.com/repos/${source}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    /** Raw file contents at a ref. */
    rawFile: (source: string, ref: string, path: string) =>
      `https://raw.githubusercontent.com/${source}/${ref}/${path}`,
    /** Latest release — JSON API. */
    latestReleaseApi: (repo: string) =>
      `https://api.github.com/repos/${repo}/releases/latest`,
    /** Latest release — human-facing page. */
    latestReleasePage: (repo: string) =>
      `https://github.com/${repo}/releases/latest`,
  },
} as const;

/** External links opened in the user's browser (not fetched). */
export const EXTERNAL_LINKS = {
  claudeUsage: "https://claude.ai/settings/usage",
} as const;
