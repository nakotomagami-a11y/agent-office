// Single source-of-truth module for the /api/docs/export endpoint.
// Returns a typed snapshot of the API surface, SSE events, DB schema,
// env vars, tools allowlist, and filesystem paths used by Agent Office.

export interface DocsExport {
  version: string;
  generated_at: string;
  api: Array<{
    path: string;
    method: string;
    description: string;
    request_type?: string;
    response_type?: string;
  }>;
  events: Array<{
    name: string;
    payload_type: string;
    description: string;
  }>;
  schema: Array<{
    table: string;
    columns: Array<{ name: string; type: string }>;
    indexes: string[];
  }>;
  env_vars: Array<{
    name: string;
    default?: string;
    effect: string;
  }>;
  tools: Array<{
    name: string;
    description: string;
    mcp_source?: string;
  }>;
  paths: Array<{
    key: string;
    path: string;
    description: string;
  }>;
  gaps: string[];
}

const API: DocsExport["api"] = [
  {
    method: "GET",
    path: "/api/health",
    description: "Check claude CLI availability and version",
    response_type: "{ available: boolean; version: string; error?: string }",
  },
  {
    method: "GET",
    path: "/api/account",
    description: "Detect active Anthropic plan from credentials file",
    response_type: '{ plan: "free" | "pro" | "max" | "api" }',
  },
  {
    method: "GET",
    path: "/api/agents",
    description: "List all agent definitions",
    response_type: "ApiAgent[]",
  },
  {
    method: "POST",
    path: "/api/agents",
    description: "Create a new agent definition",
    request_type: "agentBodySchema",
    response_type: "{ id: string }",
  },
  {
    method: "POST",
    path: "/api/agents/bulk",
    description: "Bulk-create agents",
    request_type: "agentBodySchema[]",
    response_type: "{ written: number; errors: string[] }",
  },
  {
    method: "GET",
    path: "/api/agents/[id]",
    description: "Get agent frontmatter by ID",
    response_type: "ApiAgent",
  },
  {
    method: "PUT",
    path: "/api/agents/[id]",
    description: "Update agent definition (backs up body first)",
    request_type: "agentBodySchema",
    response_type: "{ id: string }",
  },
  {
    method: "DELETE",
    path: "/api/agents/[id]",
    description: "Delete agent file and memory sidecar",
    response_type: "{ deleted: boolean }",
  },
  {
    method: "GET",
    path: "/api/agents/[id]/body",
    description: "Raw markdown body (no frontmatter)",
    response_type: "text/plain",
  },
  {
    method: "PUT",
    path: "/api/agents/[id]/body",
    description: "Replace body; backs up to <id>.body.<ISO>.md",
    request_type: "text/plain",
    response_type: "204",
  },
  {
    method: "GET",
    path: "/api/agents/[id]/body/history",
    description: "List body backup snapshots",
    response_type: "HistoryEntry[]",
  },
  {
    method: "GET",
    path: "/api/agents/[id]/body/history/[filename]",
    description: "Read one body backup snapshot",
    response_type: "text/plain",
  },
  {
    method: "GET",
    path: "/api/agents/[id]/memory",
    description: "Per-agent memory file",
    response_type: "text/plain",
  },
  {
    method: "PUT",
    path: "/api/agents/[id]/memory",
    description: "Write per-agent memory (max 256 KB)",
    request_type: "text/plain",
    response_type: '"ok"',
  },
  {
    method: "GET",
    path: "/api/agents/[id]/prompts",
    description: "Recent prompts for an agent",
    response_type: "string[]",
  },
  {
    method: "POST",
    path: "/api/agents/[id]/prompts",
    description: "Push a recent prompt",
    request_type: "{ prompt: string }",
    response_type: "{ ok: boolean }",
  },
  {
    method: "GET",
    path: "/api/agents/[id]/uploads",
    description: "List per-agent uploaded files",
    response_type: "UploadEntry[]",
  },
  {
    method: "POST",
    path: "/api/agents/[id]/uploads",
    description: "Upload a file for an agent",
    request_type: "multipart/form-data",
    response_type: "{ name: string; url: string }",
  },
  {
    method: "GET",
    path: "/api/agents/[id]/uploads/[filename]",
    description: "Download an agent upload",
    response_type: "binary",
  },
  {
    method: "GET",
    path: "/api/memory/global",
    description: "Read the global memory file injected into every agent",
    response_type: "text/plain",
  },
  {
    method: "PUT",
    path: "/api/memory/global",
    description: "Write the global memory file (max 256 KB)",
    request_type: "text/plain",
    response_type: '"ok"',
  },
  {
    method: "POST",
    path: "/api/summon",
    description: "Spawn a claude subprocess for one agent; returns runId",
    request_type: "summonRequestSchema",
    response_type: "{ runId: string; warning?: string }",
  },
  {
    method: "GET",
    path: "/api/runs",
    description: "List runs (live + DB), filterable by agent/project/instance/limit",
    response_type: "PersistedRun[]",
  },
  {
    method: "DELETE",
    path: "/api/runs",
    description: "Delete all runs for a given agent",
    response_type: "{ deleted: number }",
  },
  {
    method: "GET",
    path: "/api/runs/[id]",
    description: "Get a single run by ID",
    response_type: "PersistedRun",
  },
  {
    method: "GET",
    path: "/api/runs/[id]/stream",
    description: "SSE stream — attach to live run or replay finished run",
    response_type: "text/event-stream",
  },
  {
    method: "POST",
    path: "/api/runs/[id]/abort",
    description: "SIGKILL the claude subprocess",
    response_type: "{ aborted: boolean }",
  },
  {
    method: "GET",
    path: "/api/projects",
    description: "List project summaries",
    response_type: "ProjectSummary[]",
  },
  {
    method: "POST",
    path: "/api/projects",
    description: "Create a new project",
    request_type: "createProjectSchema",
    response_type: "Project",
  },
  {
    method: "GET",
    path: "/api/projects/[id]",
    description: "Get project detail with run count and last run timestamp",
    response_type: "Project & { runCount: number; lastRunAt: number | null }",
  },
  {
    method: "PUT",
    path: "/api/projects/[id]",
    description: "Update project metadata or memory",
    request_type: "projectMetaPatchSchema",
    response_type: "Project",
  },
  {
    method: "DELETE",
    path: "/api/projects/[id]",
    description: "Delete a project",
    response_type: "{ deleted: boolean }",
  },
  {
    method: "GET",
    path: "/api/projects/[id]/memory",
    description: "Read project memory",
    response_type: "text/plain",
  },
  {
    method: "PUT",
    path: "/api/projects/[id]/memory",
    description: "Write project memory (max 256 KB)",
    request_type: "text/plain",
    response_type: "{ ok: boolean }",
  },
  {
    method: "POST",
    path: "/api/projects/[id]/roster",
    description: "Add an agent instance to a project roster",
    request_type: "rosterAddSchema",
    response_type: "AgentInstance",
  },
  {
    method: "GET",
    path: "/api/projects/[id]/roster/[instanceId]",
    description: "Get instance detail with USD spend",
    response_type: "AgentInstance & { spend: number }",
  },
  {
    method: "PATCH",
    path: "/api/projects/[id]/roster/[instanceId]",
    description: "Update instance settings",
    request_type: "rosterPatchSchema",
    response_type: "AgentInstance",
  },
  {
    method: "DELETE",
    path: "/api/projects/[id]/roster/[instanceId]",
    description: "Remove an instance from the project roster",
  },
  {
    method: "GET",
    path: "/api/projects/[id]/spend",
    description: "USD spend breakdown by instance for a project",
    response_type: "{ byInstance: Record<string, number>; total: number }",
  },
  {
    method: "GET",
    path: "/api/projects/[id]/git-status",
    description: "Git branch, diff summary, and ahead/behind counts",
    response_type: "GitStatus",
  },
  {
    method: "GET",
    path: "/api/projects/[id]/build",
    description: "Detect whether a build script is present",
    response_type: "{ hasBuild: boolean }",
  },
  {
    method: "POST",
    path: "/api/projects/[id]/build",
    description: "Run the build script in a terminal window",
    response_type: "{ pid: number }",
  },
  {
    method: "GET",
    path: "/api/projects/[id]/dev",
    description: "Detect available dev commands and package manager",
    response_type: "{ hasPackageJson: boolean; hasNodeModules: boolean; pm: string; commands: Record<string, string> }",
  },
  {
    method: "POST",
    path: "/api/projects/[id]/dev",
    description: "Spawn a dev server in a terminal",
    request_type: "{ commandKey?: string }",
    response_type: "{ key: string; port: number; url: string; pid: number }",
  },
  {
    method: "POST",
    path: "/api/projects/[id]/install",
    description: "Run package manager install for a project",
    response_type: "{ ok: boolean; pm: string }",
  },
  {
    method: "POST",
    path: "/api/projects/[id]/open-folder",
    description: "Open project directory with xdg-open",
    response_type: "{ ok: boolean }",
  },
  {
    method: "GET",
    path: "/api/projects/[id]/uploads",
    description: "List per-project uploaded files",
    response_type: "UploadEntry[]",
  },
  {
    method: "POST",
    path: "/api/projects/[id]/uploads",
    description: "Upload a file for a project",
    request_type: "multipart/form-data",
    response_type: "{ name: string; url: string }",
  },
  {
    method: "GET",
    path: "/api/projects/[id]/uploads/[filename]",
    description: "Download a project upload",
    response_type: "binary",
  },
  {
    method: "POST",
    path: "/api/pipeline",
    description: "Create and start a multi-agent pipeline",
    request_type: "createPipelineRequestSchema",
    response_type: "{ pipelineId: string; steps: PipelineStep[] }",
  },
  {
    method: "GET",
    path: "/api/pipeline/[id]",
    description: "Poll pipeline status and step results",
    response_type: "PipelineRun",
  },
  {
    method: "POST",
    path: "/api/broadcast",
    description: "Fan-out a prompt to all roster instances on a project",
    request_type: "broadcastRequestSchema",
    response_type: "{ broadcastId: string; runIds: string[] }",
  },
  {
    method: "GET",
    path: "/api/processes",
    description: "List user's listening ports (Linux only)",
    response_type: "ProcessInfo[]",
  },
  {
    method: "GET",
    path: "/api/processes/[pid]",
    description: "Check whether a process is alive",
    response_type: "{ alive: boolean }",
  },
  {
    method: "DELETE",
    path: "/api/processes/[pid]",
    description: "SIGKILL a process by PID",
    response_type: "{ ok: boolean }",
  },
  {
    method: "GET",
    path: "/api/processes/[pid]/logs",
    description: "Get captured stdout/stderr for a process",
    response_type: "{ lines: string[]; exitCode: number | null; signal: string | null; found: boolean }",
  },
  {
    method: "GET",
    path: "/api/settings",
    description: "Read app settings (projectsRoot, excluded dirs)",
    response_type: "AppSettings",
  },
  {
    method: "PUT",
    path: "/api/settings",
    description: "Write app settings",
    request_type: "settingsPatchSchema",
    response_type: "AppSettings",
  },
  {
    method: "GET",
    path: "/api/settings/scan",
    description: "Scan filesystem for projects under a root directory",
    response_type: "ScannedEntry[]",
  },
  {
    method: "GET",
    path: "/api/ui-settings",
    description: "Read all UI key/value settings from SQLite",
    response_type: "Record<string, string>",
  },
  {
    method: "PATCH",
    path: "/api/ui-settings",
    description: "Write one or more allowed UI settings",
    request_type: "Record<string, string>",
    response_type: "{ ok: boolean }",
  },
  {
    method: "GET",
    path: "/api/skills/installed",
    description: "List installed skill packs",
    response_type: "InstalledSkill[]",
  },
  {
    method: "POST",
    path: "/api/skills/install",
    description: "Install a skill pack from GitHub",
    request_type: "skillInstallSchema",
    response_type: "{ ok: boolean; name: string }",
  },
  {
    method: "GET",
    path: "/api/skills/registry",
    description: "Fetch skill registry (cached 1 hour)",
    response_type: "RegistrySkill[]",
  },
  {
    method: "GET",
    path: "/api/skills/sources",
    description: "List registry source definitions",
  },
  {
    method: "GET",
    path: "/api/skills/updates",
    description: "Check installed skills for available updates",
    response_type: "SkillUpdate[]",
  },
  {
    method: "GET",
    path: "/api/skills/[name]",
    description: "Get a single installed skill",
    response_type: "InstalledSkill",
  },
  {
    method: "DELETE",
    path: "/api/skills/[name]",
    description: "Uninstall a skill pack",
    response_type: "{ removed: boolean }",
  },
  {
    method: "POST",
    path: "/api/skills/[name]/update",
    description: "Update a skill to the latest SHA",
    response_type: "{ ok: boolean; name: string }",
  },
  {
    method: "GET",
    path: "/api/starter/agents",
    description: "List bundled starter agent definitions",
    response_type: "StarterAgent[]",
  },
  {
    method: "POST",
    path: "/api/starter/agents",
    description: "Import selected starter agents",
    request_type: "{ agentIds: string[] }",
    response_type: "{ imported: number; skipped: number }",
  },
  {
    method: "GET",
    path: "/api/templates",
    description: "List agent creation templates",
    response_type: "AgentTemplate[]",
  },
  {
    method: "GET",
    path: "/api/transcripts",
    description: "Get or list conversation transcripts",
    response_type: "TranscriptRow | TranscriptRow[]",
  },
  {
    method: "PUT",
    path: "/api/transcripts",
    description: "Save a transcript",
    response_type: "{ ok: boolean }",
  },
  {
    method: "DELETE",
    path: "/api/transcripts",
    description: "Clear a transcript",
    response_type: "{ ok: boolean }",
  },
  {
    method: "GET",
    path: "/api/drafts",
    description: "Get composer draft for an agent+instance",
    response_type: "{ text: string }",
  },
  {
    method: "PUT",
    path: "/api/drafts",
    description: "Save composer draft",
    request_type: "{ text: string }",
    response_type: "{ ok: boolean }",
  },
  {
    method: "GET",
    path: "/api/prompts",
    description: "Get all recent prompts keyed by agentId",
    response_type: "Record<string, string[]>",
  },
  {
    method: "POST",
    path: "/api/clipboard-image",
    description: "Read clipboard PNG via wl-paste (Wayland)",
    response_type: "image/png",
  },
  {
    method: "GET",
    path: "/api/save/export",
    description: "Export a project and its agents as a portable JSON save file",
    response_type: "JSON attachment",
  },
  {
    method: "POST",
    path: "/api/save/import",
    description: "Import a project from a save file",
    request_type: "save file JSON",
    response_type: "{ ok: boolean; agentCount: number }",
  },
  {
    method: "GET",
    path: "/api/docs/export",
    description: "Machine-readable export of API surface, schema, events, env vars, tools, and paths",
    response_type: "DocsExport",
  },
];

const EVENTS: DocsExport["events"] = [
  {
    name: "attached",
    payload_type: "SseAttachedEvent",
    description:
      "Emitted immediately when a subscriber connects to a live run; carries current output, token counts, cost, status, and start timestamp",
  },
  {
    name: "chunk",
    payload_type: "SseChunkEvent",
    description:
      "Incremental text delta from the assistant as the model streams its response; also replayed to late subscribers from eventLog",
  },
  {
    name: "tool",
    payload_type: "SseToolEvent",
    description:
      "Fired when the agent invokes a tool (name + input payload); also persisted to the tool_calls table and replayed from eventLog",
  },
  {
    name: "usage",
    payload_type: "SseUsageEvent",
    description:
      "Updated cumulative token counts (tokensIn, tokensOut) and cost_usd after each assistant turn; replayed from eventLog",
  },
  {
    name: "done",
    payload_type: "SseDoneEvent",
    description:
      "Run completed or was aborted; carries exitCode, sessionId, durationMs, and final usage totals; not stored in eventLog",
  },
  {
    name: "error",
    payload_type: "SseErrorEvent",
    description:
      "Agent subprocess error or rate-limit event; message describes the cause; not stored in eventLog",
  },
];

const SCHEMA: DocsExport["schema"] = [
  {
    table: "runs",
    columns: [
      { name: "id", type: "TEXT PRIMARY KEY" },
      { name: "agent_id", type: "TEXT" },
      { name: "agent_name", type: "TEXT" },
      { name: "instance_id", type: "TEXT DEFAULT 'default'" },
      { name: "instance_label", type: "TEXT" },
      { name: "project_id", type: "TEXT" },
      { name: "session_id", type: "TEXT" },
      { name: "status", type: "TEXT DEFAULT 'running'" },
      { name: "exit_code", type: "INTEGER" },
      { name: "prompt", type: "TEXT" },
      { name: "output", type: "TEXT DEFAULT ''" },
      { name: "tokens_in", type: "INTEGER DEFAULT 0" },
      { name: "tokens_out", type: "INTEGER DEFAULT 0" },
      { name: "cost_usd", type: "REAL DEFAULT 0" },
      { name: "dur_ms", type: "INTEGER" },
      { name: "model", type: "TEXT DEFAULT ''" },
      { name: "effort", type: "TEXT DEFAULT ''" },
      { name: "cwd", type: "TEXT" },
      { name: "started_at", type: "INTEGER" },
      { name: "ended_at", type: "INTEGER" },
    ],
    indexes: [
      "idx_runs_agent (agent_id, started_at DESC)",
      "idx_runs_project (project_id, started_at DESC)",
      "idx_runs_instance (agent_id, instance_id, started_at DESC)",
      "idx_runs_started_at (started_at DESC)",
    ],
  },
  {
    table: "messages",
    columns: [
      { name: "id", type: "TEXT PRIMARY KEY" },
      { name: "run_id", type: "TEXT REFERENCES runs(id)" },
      { name: "agent_id", type: "TEXT" },
      { name: "instance_id", type: "TEXT DEFAULT 'default'" },
      { name: "role", type: "TEXT CHECK(role IN ('user','assistant'))" },
      { name: "content", type: "TEXT" },
      { name: "ts", type: "INTEGER" },
    ],
    indexes: [
      "idx_messages_run (run_id)",
      "idx_messages_ai (agent_id, instance_id, ts DESC)",
    ],
  },
  {
    table: "messages_fts",
    columns: [
      { name: "content", type: "FTS5 virtual (content=messages, content_rowid=rowid)" },
    ],
    indexes: [],
  },
  {
    table: "tool_calls",
    columns: [
      { name: "id", type: "TEXT PRIMARY KEY" },
      { name: "run_id", type: "TEXT REFERENCES runs(id)" },
      { name: "name", type: "TEXT" },
      { name: "input", type: "TEXT" },
      { name: "ts", type: "INTEGER" },
    ],
    indexes: ["idx_tool_calls_run (run_id)"],
  },
  {
    table: "recent_prompts",
    columns: [
      { name: "id", type: "INTEGER PRIMARY KEY AUTOINCREMENT" },
      { name: "agent_id", type: "TEXT" },
      { name: "prompt", type: "TEXT" },
      { name: "used_at", type: "INTEGER" },
    ],
    indexes: ["idx_prompts_agent (agent_id, used_at DESC)"],
  },
  {
    table: "transcripts",
    columns: [
      { name: "agent_id", type: "TEXT" },
      { name: "instance_id", type: "TEXT DEFAULT 'default'" },
      { name: "items", type: "TEXT DEFAULT '[]'" },
      { name: "active_run_id", type: "TEXT" },
      { name: "session_id", type: "TEXT" },
      { name: "updated_at", type: "INTEGER" },
    ],
    indexes: [],
  },
  {
    table: "drafts",
    columns: [
      { name: "agent_id", type: "TEXT" },
      { name: "instance_id", type: "TEXT DEFAULT 'default'" },
      { name: "text", type: "TEXT DEFAULT ''" },
      { name: "updated_at", type: "INTEGER" },
    ],
    indexes: [],
  },
  {
    table: "ui_settings",
    columns: [
      { name: "key", type: "TEXT PRIMARY KEY" },
      { name: "value", type: "TEXT" },
      { name: "updated_at", type: "INTEGER" },
    ],
    indexes: [],
  },
  {
    table: "pipelines",
    columns: [
      { name: "id", type: "TEXT PRIMARY KEY" },
      { name: "project_id", type: "TEXT" },
      { name: "status", type: "TEXT DEFAULT 'running'" },
      { name: "created_at", type: "INTEGER" },
      { name: "ended_at", type: "INTEGER" },
      { name: "interrupted", type: "INTEGER DEFAULT 0" },
    ],
    indexes: ["idx_pipelines_project (project_id, created_at DESC)"],
  },
  {
    table: "pipeline_steps",
    columns: [
      { name: "pipeline_id", type: "TEXT REFERENCES pipelines(id)" },
      { name: "step_index", type: "INTEGER" },
      { name: "parallel_group", type: "INTEGER" },
      { name: "agent_id", type: "TEXT" },
      { name: "run_id", type: "TEXT" },
      { name: "status", type: "TEXT DEFAULT 'pending'" },
      { name: "output", type: "TEXT" },
      { name: "exit_code", type: "INTEGER" },
    ],
    indexes: ["idx_pipeline_steps_pipeline (pipeline_id)"],
  },
];

const ENV_VARS: DocsExport["env_vars"] = [
  {
    name: "ANTHROPIC_API_KEY",
    effect:
      "Passed through to the claude CLI subprocess via inherited env; required for any agent run to succeed",
  },
  {
    name: "PATH",
    effect:
      "Augmented before every claude spawn to prepend NVM node bin dirs, ~/.local/bin, /usr/local/bin so the claude binary is resolvable in desktop sessions",
  },
  {
    name: "AGENT_OFFICE_STARTER_DATA",
    default: "<cwd>/starter-data",
    effect:
      "Override path to the bundled starter-data directory containing starter agents and skills",
  },
  {
    name: "NEXT_PUBLIC_POLL_RUNS",
    default: "5000",
    effect: "Polling interval in ms for the run list",
  },
  {
    name: "NEXT_PUBLIC_POLL_HEALTH",
    default: "30000",
    effect: "Polling interval in ms for the health check",
  },
  {
    name: "NEXT_PUBLIC_POLL_SKILLS_UPDATES",
    default: "60000",
    effect: "Polling interval in ms for the skills update check",
  },
  {
    name: "DEFAULT_LOCALE",
    default: "en",
    effect: "i18n locale override read by apps/web/src/i18n/request.ts",
  },
  {
    name: "NODE_ENV",
    default: "production",
    effect:
      "Standard Next.js environment flag; enables React Query Devtools when set to development",
  },
  {
    name: "PORT",
    effect:
      "Injected into the terminal environment when launching a dev server via /api/projects/[id]/dev",
  },
];

const TOOLS: DocsExport["tools"] = [
  { name: "Read", description: "Read a file from the local filesystem" },
  { name: "Write", description: "Create or overwrite a file on the local filesystem" },
  { name: "Edit", description: "Apply a targeted string-replacement edit to an existing file" },
  { name: "Bash", description: "Execute a shell command and capture stdout/stderr" },
  { name: "Grep", description: "Search file contents with ripgrep" },
  { name: "Glob", description: "List files matching a glob pattern" },
  { name: "LS", description: "List directory contents" },
  { name: "Task", description: "Spawn a sub-agent" },
  { name: "TodoRead", description: "Read the current in-session task list" },
  { name: "TodoWrite", description: "Write or update the in-session task list" },
  { name: "WebFetch", description: "Fetch a URL and return its text content" },
  { name: "WebSearch", description: "Run a web search query" },
  {
    name: "mcp__playwright__*",
    description: "Browser automation tools provided by the Playwright MCP server",
    mcp_source: "playwright",
  },
  {
    name: "mcp__chrome-devtools__*",
    description: "Chrome DevTools tools for inspecting the user's live browser session",
    mcp_source: "chrome-devtools",
  },
];

const PATHS: DocsExport["paths"] = [
  {
    key: "CLAUDE_DIR",
    path: "~/.claude",
    description: "Root of all Claude Code and Agent Office on-disk state",
  },
  {
    key: "AGENTS_DIR",
    path: "~/.claude/agents",
    description:
      "Agent definition Markdown files (<id>.md) and per-agent memory files (<id>.memory.md)",
  },
  {
    key: "GLOBAL_MEMORY_PATH",
    path: "~/.claude/agents/_global.memory.md",
    description: "Global memory file injected into every agent's system prompt",
  },
  {
    key: "SKILLS_DIR",
    path: "~/.claude/agents/_skills",
    description:
      "Installed skill Markdown files; each subdirectory contains SKILL.md and .source.json",
  },
  {
    key: "SKILLS_REGISTRY_CACHE",
    path: "~/.claude/agents/_skills/_registry.json",
    description: "Skills registry cache with a 1-hour TTL",
  },
  {
    key: "AGENT_UPLOADS_DIR",
    path: "~/.claude/agents/_uploads/<agentId>",
    description: "Per-agent uploaded files attached to prompts",
  },
  {
    key: "PROJECTS_DIR",
    path: "~/.claude/projects",
    description: "Per-project directories containing project.md and _uploads/",
  },
  {
    key: "SETTINGS_FILE",
    path: "~/.claude/agent-office-settings.json",
    description: "App-level settings (projectsRoot, excluded dirs, firstRunComplete)",
  },
  {
    key: "APP_STATE_DIR",
    path: "~/.claude/agent-office",
    description: "Agent Office runtime state root (DB and legacy migration artifacts)",
  },
  {
    key: "DB_PATH",
    path: "~/.claude/agent-office/db.sqlite",
    description:
      "SQLite database in WAL mode storing runs, messages, transcripts, drafts, and pipelines",
  },
  {
    key: "CREDENTIALS_FILE",
    path: "~/.claude/.credentials.json",
    description: "Claude auth credentials read for plan detection by /api/account",
  },
  {
    key: "WORKTREE_DIR",
    path: "<projectCwd>/.worktrees/<instanceId>",
    description: "Git worktree per agent instance used in multi-instance project mode",
  },
  {
    key: "PROJECT_AO_JSON",
    path: "<projectCwd>/.ao.json",
    description: "Per-project build/dev command overrides read by the build and dev routes",
  },
];

const GAPS: string[] = [
  "api: request_type not verified against actual Zod schema field names for all routes — derived from source-map annotations",
  "api: response_type for roster DELETE /api/projects/[id]/roster/[instanceId] is unspecified in source map",
  "env_vars: NEXT_PUBLIC_APP_VERSION from source-map is omitted — not found in lib/polling.ts or confirmed read path",
  "tools: no application-level allowlist enforced; values are passed verbatim from agent frontmatter to claude CLI",
  "schema: transcripts and drafts tables use composite PK (agent_id, instance_id) not representable in the columns array",
  "schema: messages_fts virtual table column list is synthetic — FTS5 columns are content-mapped, not defined explicitly",
];

export function buildDocsExport(): DocsExport {
  return {
    version: "0.1.0",
    generated_at: new Date().toISOString(),
    api: API,
    events: EVENTS,
    schema: SCHEMA,
    env_vars: ENV_VARS,
    tools: TOOLS,
    paths: PATHS,
    gaps: GAPS,
  };
}
