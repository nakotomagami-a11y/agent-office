/** Every API path, built here and nowhere else: the web UI and out-of-process clients (the Minecraft mod) address the server through these. */
export const API_ROUTES = {
  health: "/api/health",
  templates: "/api/templates",
  account: "/api/account",
  clipboardImage: "/api/clipboard-image",
  devSeed: "/api/dev/seed",
  devLoopIds: "/api/dev/loop-ids",
  devPlanetGallery: "/api/dev/planet-gallery",
  devBackfillPlanets: "/api/dev/backfill-planets",
  power: "/api/power",
  prompts: "/api/prompts",
  docsContent: "/api/docs/content",
  docsExport: "/api/docs/export",
  starterAgents: "/api/starter/agents",
  starterAgentDiff: "/api/starter/agent-diff",

  agents: "/api/agents",
  agentsBulk: "/api/agents/bulk",
  agent: (id: string) => `/api/agents/${encodeURIComponent(id)}`,
  agentBody: (id: string) => `/api/agents/${encodeURIComponent(id)}/body`,
  agentBodyHistory: (id: string) => `/api/agents/${encodeURIComponent(id)}/body/history`,
  agentBodySnapshot: (id: string, filename: string) =>
    `/api/agents/${encodeURIComponent(id)}/body/history/${encodeURIComponent(filename)}`,
  agentPromptPreview: (id: string) => `/api/agents/${encodeURIComponent(id)}/prompt-preview`,
  agentMemory: (id: string) => `/api/agents/${encodeURIComponent(id)}/memory`,
  agentPrompts: (id: string) => `/api/agents/${encodeURIComponent(id)}/prompts`,
  agentUploads: (id: string) => `/api/agents/${encodeURIComponent(id)}/uploads`,
  agentUploadFile: (id: string, filename: string) =>
    `/api/agents/${encodeURIComponent(id)}/uploads/${encodeURIComponent(filename)}`,
  generatedImages: "/api/generated-images",
  generatedImage: (date: string, filename: string) =>
    `/api/generated-images/${encodeURIComponent(date)}/${encodeURIComponent(filename)}`,
  agentContextCost: (id: string) => `/api/agents/${encodeURIComponent(id)}/context-cost`,
  agentContextCostMeasure: (id: string) => `/api/agents/${encodeURIComponent(id)}/context-cost/measure`,

  memoryGlobal: "/api/memory/global",

  uiSettings: "/api/ui-settings",
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
  projectSpend: (id: string) => `/api/projects/${encodeURIComponent(id)}/spend`,

  processes: "/api/processes",
  process: (pid: number) => `/api/processes/${pid}`,
  processLogs: (pid: number) => `/api/processes/${pid}/logs`,
  processStdin: (pid: number) => `/api/processes/${pid}/stdin`,

  flutterRun: "/api/flutter/run",
  flutterMirror: "/api/flutter/mirror",
  flutterDevices: "/api/flutter/devices",
  flutterScreenshot: "/api/flutter/screenshot",

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
  runPermission: (id: string) => `/api/runs/${encodeURIComponent(id)}/permission`,
  /** App-wide SSE stream of coarse domain events (see app-events.tsx). */
  events: "/api/events",
  runAbort: (id: string) => `/api/runs/${encodeURIComponent(id)}/abort`,
  runChildren: (id: string) => `/api/runs/${encodeURIComponent(id)}/children`,
  runTree: (id: string) => `/api/runs/${encodeURIComponent(id)}/tree`,

  summon: "/api/summon",

  // Server-authoritative chat conversations (see docs/chat-refactor.md).
  conversations: "/api/conversations",
  conversation: (id: string) => `/api/conversations/${encodeURIComponent(id)}`,
  conversationMessages: (id: string) => `/api/conversations/${encodeURIComponent(id)}/messages`,
  conversationQueueItem: (id: string, messageId: string) =>
    `/api/conversations/${encodeURIComponent(id)}/queue/${encodeURIComponent(messageId)}`,
  conversationQueue: (id: string) => `/api/conversations/${encodeURIComponent(id)}/queue`,

  // The Loop (docs: ROADMAP Wave 5). A loop is a property of a send.
  loops: "/api/loops",
  loop: (id: string) => `/api/loops/${encodeURIComponent(id)}`,
  conversationResume: (id: string) => `/api/conversations/${encodeURIComponent(id)}/resume`,
  conversationRetry: (id: string) => `/api/conversations/${encodeURIComponent(id)}/retry`,
  conversationSkip: (id: string) => `/api/conversations/${encodeURIComponent(id)}/skip`,
  conversationNew: (id: string) => `/api/conversations/${encodeURIComponent(id)}/new`,

  schedules: "/api/schedules",
  schedule: (id: string) => `/api/schedules/${encodeURIComponent(id)}`,
  scheduleRun: (id: string) => `/api/schedules/${encodeURIComponent(id)}/run`,
  broadcast: "/api/broadcast",

  settings: "/api/settings",
  settingsScan: "/api/settings/scan",
  userAnalysis: "/api/user-analysis",

  workflows: "/api/workflows",
  workflowById: (id: string) => `/api/workflows/${encodeURIComponent(id)}`,
  workflowUse: (id: string) => `/api/workflows/${encodeURIComponent(id)}/use`,
  workflowsBulk: "/api/workflows/bulk",

  agentDocs: "/api/agent-docs",
  agentDoc: (owner: string, slug: string) =>
    `/api/agent-docs/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}`,

  cleanup: (kind: string) => `/api/cleanup/${encodeURIComponent(kind)}`,

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

  // Pull-request review (the Review Lectern).
  projectReviews: (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/reviews`,
  projectReview: (projectId: string, pr: number) =>
    `/api/projects/${encodeURIComponent(projectId)}/reviews/${pr}`,
  projectReviewSubmit: (projectId: string, pr: number) =>
    `/api/projects/${encodeURIComponent(projectId)}/reviews/${pr}/review`,
  projectReviewMerge: (projectId: string, pr: number) =>
    `/api/projects/${encodeURIComponent(projectId)}/reviews/${pr}/merge`,
  projectReviewReject: (projectId: string, pr: number) =>
    `/api/projects/${encodeURIComponent(projectId)}/reviews/${pr}/reject`,
  projectReviewLink: (projectId: string, pr: number) =>
    `/api/projects/${encodeURIComponent(projectId)}/reviews/${pr}/link`,

  analyticsPerAccount: "/api/analytics/per-account",
  analyticsSummary: "/api/analytics/summary",
  analyticsPage: "/api/analytics/page",
} as const;
