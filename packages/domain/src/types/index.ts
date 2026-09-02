export type AgentStatus = "idle" | "working" | "done" | "error" | "thinking" | "queued";

export interface RegistrySkill {
  source: string;
  ref: string;
  name: string;
  description: string;
  path: string;
  sha: string;
  tags: string[];
  installed: boolean;
  /**
   * Byte size of the skill's `SKILL.md` as reported by the GitHub tree API at
   * scan time. Proxy for "how heavy" the skill is (context/token cost).
   * Optional: older cached registries won't have it until the next refresh.
   */
  size?: number;
}

export interface SkillProvenance {
  source: string;
  ref: string;
  path: string;
  sha: string;
  installedAt: string;
}

export interface InstalledSkill {
  name: string;
  description: string;
  body: string;
  provenance?: SkillProvenance;
}

export interface SkillUpdate {
  name: string;
  currentSha: string;
  latestSha: string;
  source: string;
  path: string;
}

export interface ApiAgent {
  /** Stable slug / identifier (kebab-case). Used as the ID everywhere. */
  name: string;
  /** Human-readable name shown in the UI. Editable in agent customization;
   *  persisted as the `display-name` frontmatter field. Undefined for agents
   *  that haven't set one — the UI falls back to prettifying the slug. */
  displayName?: string;
  description: string;
  skills: string[];
  tools: string[];
  defaultModel?: string;
  defaultEffort?: string;
  permissionMode?: string;
  room?: string;
  /** Extra directories the agent is allowed to read/write beyond the cwd. Passed as --add-dir. */
  addDirs?: string[];
  /**
   * Optional avatar override in the form `"<faction>/<kind>"` (e.g.
   * `"blue/pawn"`). When unset the UI hashes the agent name to pick a
   * deterministic Tiny Swords unit.
   */
  unit?: string;
}

export interface AgentBody {
  /** Human-readable display name (persisted as `display-name` frontmatter). */
  name: string;
  /** Stable slug / identifier — the frontmatter `name` and the filename. */
  id: string;
  desc: string;
  skills: string[];
  tools: string[];
  pm: string;
  model: string;
  effort: string;
  body: string;
  room?: string;
  /** Avatar override, see {@link ApiAgent.unit}. Empty string clears it. */
  unit?: string;
}

export interface PersistedRun {
  id: string;
  agentId: string;
  agentName: string;
  ts: number;
  prompt: string;
  status: "running" | "done" | "error";
  /** Subprocess exit code. 130 indicates SIGINT/SIGTERM (server restart). */
  exitCode?: number;
  output: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  durMs: number;
  model: string;
  effort: string;
  cwd?: string;
  projectId?: string;
  instanceId?: string;
  instanceLabel?: string;
  /** Claude CLI session ID - pass as --resume on the next turn. */
  sessionId?: string;
  /** Set for sub-agent runs spawned by a Task tool call. */
  parentRunId?: string;
  /** Account whose CLAUDE_CONFIG_DIR the run spawned under (undefined → default). */
  accountId?: string;
  /** Live-only: name of the tool call in flight right now (e.g. "Bash",
   *  "Read", "Grep"). Only ever set while `status === "running"` — sourced
   *  from the in-memory live-run registry, not persisted to the DB. */
  currentTool?: string;
}

/**
 * A node in the live spawn tree for a run. Built by walking `parentRunId` links
 * (DB) and overlaying in-flight `liveRuns` state. Powers the Workflow pill/tree.
 */
export interface WorkflowNode {
  runId: string;
  agentId: string;
  agentName: string;
  status: PersistedRun["status"];
  prompt: string;
  startTs: number;
  durMs: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  currentTool?: string;
  children: WorkflowNode[];
}

export interface AgentInstance {
  instanceId: string;
  agentId: string;
  label?: string;
  model?: string;
  effort?: string;
  permissionMode?: string;
  room?: string;
  /** Absolute path to the git worktree for this instance. Falls back to project.meta.cwd when unset. */
  cwd?: string;
  worktree?: {
    branch: string;   // e.g. "agent/frontend-craftsman-abc1-1716800000000"
    basePath: string; // e.g. "/path/to/project/.worktrees/frontend-craftsman-abc1"
    createdAt: number; // unix ms
  };
  /**
   * Transient (never persisted): set by the project read API when the instance
   * is pinned to a git worktree whose directory is missing on disk, so the UI
   * can surface a "needs repair" badge. Healed automatically on next run/boot.
   */
  worktreeMissing?: boolean;
}

export type PlanetType = "gas-giant" | "rocky" | "terran" | "ringed-terran" | "toxic" | "ice" | "islands" | "lava" | "ice-moon" | "eclipse" | "black-hole" | "galaxy" | "star" | "asteroid" | "comet";

export interface PlanetConfig {
  type: PlanetType;
  seed: number;
  paletteIdx: number;
  pixels?: number;   // logical pixel density 10-1000, editor default 1000
  rotation?: number; // radians, default derived from seed
  dither?: boolean;  // dither mode, default true
  customPalette?: [number, number, number][][]; // per-layer color overrides (RGB 0-1)
  params?: Record<string, number>; // per-type tunable knobs (see PLANET_PARAM_DEFS)
}

export interface ProjectMeta {
  name: string;
  description: string;
  cwd?: string;
  roster: AgentInstance[];
  planet?: PlanetConfig;
  /**
   * Multi-account: which Claude account (from the `accounts` service) runs
   * `claude` for this project. `undefined` (or `"default"`) → use the shared
   * `~/.claude`. Set via the project detail account picker (slice 4).
   */
  accountId?: string;
  /**
   * Per-project GitHub account: which registered github account's `GH_CONFIG_DIR`
   * is injected for every git/gh command the agent runs in this project.
   * `undefined` (or `"default"`) → no injection; inherit the system gh auth.
   * Set via the project detail github account picker.
   */
  githubAccountId?: string;
  /**
   * Shelved projects are hidden from the default project picker view (they
   * move to the "Shelved" filter). Absent/false → active. Set by the user via
   * the project picker's shelve toggle.
   */
  shelved?: boolean;
}

/**
 * A Claude Code account registered with agent-office. Every account has its
 * own `CLAUDE_CONFIG_DIR` (see `accountConfigDir(id)` in paths.ts). The
 * `default` account is auto-inserted on boot and points at `~/.claude`; all
 * others live under `~/.claude/agent-office/accounts/<id>/` with a real
 * `.credentials.json` plus symlinks to `~/.claude/agents`, `skills`, etc.
 */
export interface Account {
  id: string;
  label: string;
  configDir: string;
  createdAt: number;
}

export type ClaudePlan = "free" | "pro" | "max" | "api" | "custom";

export interface AccountWithStatus extends Account {
  plan: ClaudePlan;
  email?: string;
  /** True when `<configDir>/.credentials.json` exists and parses. */
  ready: boolean;
}

/**
 * A GitHub account registered with agent-office. Every non-default account has
 * its own `GH_CONFIG_DIR` (see `githubAccountConfigDir(id)` in paths.ts) that
 * `gh` and git-over-HTTPS read auth from. The `default` account maps to the
 * system gh config (`~/.config/gh`) and is never injected — projects on it
 * inherit whatever gh auth the machine has active.
 */
export interface GithubAccount {
  id: string;
  label: string;
  configDir: string;
  createdAt: number;
}

export interface GithubAccountWithStatus extends GithubAccount {
  /** Logged-in GitHub username reported by `gh api user`, when available. */
  username?: string;
  /** True when `gh` reports an authenticated user for this config dir. */
  ready: boolean;
}

/**
 * A reusable secret: a free-form named env var (`name` is injected verbatim
 * into a run's environment as `env[name] = value`) with optional expiry and a
 * shell test command for live validity checks. Stored once and linked to any
 * number of projects via the `project_secrets` join. Never scoped per-agent.
 * The raw `value` is only ever returned by the write path (create/update) — the
 * list/status endpoints return `SecretWithStatus`, which omits it.
 */
export interface Secret {
  id: string;
  /** Exact env var name injected into the run, e.g. `VERCEL_TOKEN`. */
  name: string;
  label: string;
  value: string;
  /** Epoch ms the token expires; null = never / unknown. */
  expiresAt: number | null;
  /** Optional shell command run (with the secret in env) to prove validity. */
  testCmd: string | null;
  /** When true + testCmd set, a failed live test blocks a run using this key. */
  verifyBeforeRun: boolean;
  lastTestedAt: number | null;
  /** null = never tested / unknown, true = last test passed, false = failed. */
  lastTestOk: boolean | null;
  createdAt: number;
}

/** Secret without its raw `value` — the read-path shape for lists/pickers. */
export type SecretWithStatus = Omit<Secret, "value"> & {
  /** True when expiresAt is set and in the past. */
  expired: boolean;
  /** Count of projects this secret is attached to. */
  projectCount: number;
};

export interface AppSettings {
  projectsRoot: string;
  excluded: string[];
  firstRunComplete: boolean;
  features?: {
    multiInstance?: boolean;
  };
  /** Per-integration on/off state (keys from the integration registry). Absent
   *  keys fall back to the registry's defaultEnabled — see isIntegrationEnabled. */
  integrations?: Record<string, boolean>;
}

/** One agent-body backup snapshot — GET /api/agents/<id>/body/history. */
export interface AgentBodyHistoryEntry {
  filename: string;
  ts: number;
  sizeBytes: number;
}

/** One tab in the in-app /docs page (from docs/_index.json). */
export interface DocsTabConfig {
  id: string;
  label: string;
  file: string;
}

/** The docs tab config served by GET /api/docs/content. */
export interface DocsIndex {
  version: number;
  tabs: DocsTabConfig[];
}

/** An adb/flutter device — GET /api/flutter/devices. */
export interface FlutterDevice {
  id: string;
  name: string;
  model: string;
  status: "device" | "offline" | "unauthorized" | "no permissions";
  transportType: "usb" | "tcp";
}

/** A tracked dev/build server process — GET /api/processes. */
export interface ProcessInfo {
  pid: number;
  port: number;
  address: string;
  name: string;
  cmd: string;
  cwd: string;
  startedAt: number;
  memMb: number;
  projectId?: string;
  projectName?: string;
}

/** A project's git working-tree summary — GET /api/projects/<id>/git-status. */
export interface GitStatus {
  isGit: boolean;
  branch?: string;
  added: number;
  removed: number;
  filesChanged: number;
  ahead: number;
  behind: number;
}

/** A runnable dev command detected for a project — GET /api/projects/<id>/dev. */
export interface DetectedCommand {
  key: string;
  name: string;
  argv: string[];
  portMode: "next" | "flutter" | "env" | "device";
  cwd?: string; // override project root (e.g. nested Flutter app)
}

export interface ScannedEntry {
  id: string;
  name: string;
  fullPath: string;
  excluded: boolean;
}

export interface Project {
  id: string;
  meta: ProjectMeta;
  memory: string;
  runCount?: number;
  lastRunAt?: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  cwd?: string;
  instanceCount: number;
  lastRunAt?: number;
  planet?: PlanetConfig;
  shelved?: boolean;
}

export interface HealthInfo {
  available: boolean;
  version: string | null;
  error?: string;
}

/**
 * A reusable multi-step prompt in the workflow library. Under the hood the
 * DB table is still `saved_prompts` (rename would risk live data) but every
 * surface — API paths, types, UI — talks about workflows.
 */
export interface Workflow {
  id: string;
  title: string;
  body: string;
  /** Category slug. Starter workflows use `"starter"`; user-authored can use
   *  any string. Used for the picker's tab filter. */
  category: string;
  createdAt: number;
  useCount: number;
}

export interface SummonRequest {
  agentId: string;
  prompt: string;
  model?: string;
  effort?: string;
  maxBudgetUsd?: number;
  cwd?: string;
  projectId?: string;
  instanceId?: string;
  /** Session ID from the previous turn - passed as --resume to continue the conversation. */
  resumeSessionId?: string;
  /** How much prior-conversation context to inject. Defaults to "balanced". */
  contextProfile?: ContextProfile;
}

export type ContextProfile = "tight" | "balanced" | "deep";

export type ScheduledJobStatus = "pending" | "firing" | "done" | "cancelled" | "needs-attention";
export type ScheduledJobAttention = "stale" | "missing-instance" | "retry-exceeded";

/** A unit of scheduled work: a serialized summon plus the time to fire it. */
export interface ScheduledJob {
  id: string;
  /** Unix ms. Job fires on the first tick at or after this time. */
  fireAt: number;
  summonRequest: SummonRequest;
  /** How the job was created. */
  reason: "manual" | "rate-limit";
  /** Human label for the schedules list (agent + prompt snippet). */
  label: string;
  status: ScheduledJobStatus;
  /** Why a job needs the user's attention (only set when status is needs-attention). */
  attention?: ScheduledJobAttention;
  /** Consecutive rate-limit re-schedules of this job. */
  attempts: number;
  /** Run started by the most recent fire (used to detect a repeat rate-limit). */
  firedRunId?: string;
  createdAt: number;
  updatedAt: number;
}

export type SseEventName = "chunk" | "tool" | "usage" | "done" | "error" | "attached" | "subagent" | "subagent-update" | "rate-limit";

export interface SseChunkEvent { runId: string; text: string }
export interface SseToolEvent { runId: string; name: string; input?: unknown }
export interface SseUsageEvent { runId: string; tokensIn: number; tokensOut: number; cost: number }
export interface SseDoneEvent { runId: string; exitCode: number; sessionId?: string; durationMs?: number; tokensIn?: number; tokensOut?: number; cost?: number }
// Run-error codes are the shared FE/BE vocabulary. The runtime values
// (`RUN_ERROR_CODES`, `isRunErrorCode`) live in `../config/run-errors` — the
// `RunErrorCode` type is re-exported here so type-only consumers keep importing
// from `@agent-office/domain/types` and this module stays type-only.
export type { RunErrorCode } from "../config/run-errors";
import type { RunErrorCode } from "../config/run-errors";
// Catalog-derived types (runtime const + guard live in ../config/*); re-exported
// so type-only consumers keep importing from `@agent-office/domain/types`.
export type { DocCategory } from "../config/doc-categories";
export type { SkillIconClass } from "../config/skill-icons";
export type { CleanupKind } from "../config/cleanup";
import type { DocCategory } from "../config/doc-categories";
import type { SkillIconClass } from "../config/skill-icons";

export interface SseErrorEvent { runId: string; code: RunErrorCode; detail?: string; interrupted?: boolean }
export interface SseRateLimitEvent { runId: string; message: string; resetsAt?: number; severity: "warning" | "limit" }
export interface SseAttachedEvent {
  runId: string;
  output: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  status: PersistedRun["status"];
  startTs: number;
}

export type SubAgentStatus = "queued" | "running" | "cancelling" | "done" | "error" | "cancelled" | "timeout";

export interface SseSubAgentEvent {
  type: "subagent";
  parentRunId: string;
  subRunId: string;
  agentId: string;
  prompt: string;
  status: SubAgentStatus;
}

export interface SseSubAgentUpdateEvent {
  type: "subagent-update";
  subRunId: string;
  status: SubAgentStatus;
  currentTool?: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  lastOutputLine?: string;
}

export type RunStreamEvent =
  | { name: "attached"; data: SseAttachedEvent }
  | { name: "chunk"; data: SseChunkEvent }
  | { name: "tool"; data: SseToolEvent }
  | { name: "usage"; data: SseUsageEvent }
  | { name: "done"; data: SseDoneEvent }
  | { name: "error"; data: SseErrorEvent }
  | { name: "rate-limit"; data: SseRateLimitEvent }
  | { name: "subagent"; data: SseSubAgentEvent }
  | { name: "subagent-update"; data: SseSubAgentUpdateEvent };

// ─── Pipeline types ──────────────────────────────────────────────────────────

export interface PipelineStep {
  agentId: string;
  instanceId?: string;
  /** May contain {{output}} which is replaced by the previous step's finalised output. */
  promptTemplate: string;
  model?: string;
  effort?: string;
}

/** A group of steps that run concurrently; outputs are joined for the next sequential step. */
export interface ParallelPipelineStep {
  kind: "parallel";
  steps: PipelineStep[];
}

export interface CreatePipelineRequest {
  steps: (PipelineStep | ParallelPipelineStep)[];
  projectId?: string;
  cwd?: string;
}

export interface PipelineRunStep {
  stepIndex: number;
  agentId: string;
  runId: string;
  status: "pending" | "running" | "done" | "error";
  output?: string;
  exitCode?: number;
  /** When set, this step belongs to a parallel group; steps with the same value run concurrently. */
  parallelGroup?: number;
}

export interface PipelineRun {
  id: string;
  projectId?: string;
  steps: PipelineRunStep[];
  status: "running" | "done" | "error";
  createdAt: number;
  /** True when the server restarted while this pipeline was running. */
  interrupted?: boolean;
}

/**
 * A project tab in the Chrome-style tab strip. One tab per project (MVP);
 * opening an already-tabbed project focuses the existing tab. Each tab
 * remembers its last-known route so switching tabs restores where the user
 * was inside that project (agent details modal, memory view, docs sub-route,
 * etc.). Persisted server-side under `ui_settings.tabs-state` as a JSON blob
 * of the full `TabsState`.
 */
export interface Tab {
  /** Stable id (uuid). Distinct from `projectId` because a project can be
   * closed and re-opened as a different tab instance in future iterations. */
  id: string;
  projectId: string;
  /** Last-known route within this tab, e.g. `/projects/inwhite`. Updated
   * whenever the user navigates inside the active tab. */
  currentPath: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
}

// ─── Docs contracts ──────────────────────────────────────────────────────────
// Produced by the docs service, consumed by the /docs + memory UIs.

export interface DocFrontmatter {
  title: string;
  category: DocCategory;
  created: string; // ISO 8601
  updated: string; // ISO 8601
}

export interface DocMeta extends DocFrontmatter {
  /** Owner slug — either an agent-id or `_global`. */
  owner: string;
  /** Filename without extension. Stable, URL-safe id. */
  slug: string;
}

export interface Doc extends DocMeta {
  /** Markdown body (frontmatter stripped). */
  body: string;
}

// ─── Skill contracts ─────────────────────────────────────────────────────────
// Manifest / compatibility / customization shapes exchanged with the skills UI.

export interface SkillManifestEntry {
  slug: string;
  source_id?: string;
  source_path?: string;
  symlink_status?: string;
  target?: string;
  category?: string;
  workflow_depth?: string;
  token_cost_est?: number;
  impact_tier?: string;
  impact_emoji?: string;
  description?: string;
}

export interface SkillManifest {
  generated_at?: string;
  generator?: string;
  cost_indicator_scale?: Record<string, string>;
  workflow_depth_legend?: Record<string, string>;
  sources?: Record<string, unknown>;
  skills: SkillManifestEntry[];
}

export interface SkillCompatibility {
  conflicts?: unknown;
  synergies?: unknown;
  ab_test_pairs?: unknown;
  [k: string]: unknown;
}

export interface SkillCustomization {
  /** Slugs of `##` sections the user has switched off. */
  disabledSections?: string[];
  /** A full user-authored body that replaces upstream. */
  overrideBody?: string;
  /** The SKILL.md SHA the override was authored against. */
  basedOnSha?: string;
}
export type SkillCustomizationMap = Record<string, SkillCustomization>;

export interface SkillSection {
  /** Stable id derived from the heading text (deduped). */
  slug: string;
  /** Display text of the `##` heading. */
  heading: string;
}

export interface SkillIconConfig {
  seed: string;
  iconClass: SkillIconClass;
}
export type SkillIconMap = Record<string, SkillIconConfig>;

// ─── Analytics contracts ─────────────────────────────────────────────────────
// SQL rollups produced by the analytics services, rendered by the analytics UI.

export interface AnalyticsTotals {
  runs: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  /** Wall-clock agent runtime, ms. */
  runtimeMs: number;
  done: number;
  errors: number;
}

export interface ModelFamilyRow {
  /** Consolidated family key: `opus` | `sonnet` | `haiku` | raw id. */
  family: string;
  label: string;
  runs: number;
  tokens: number;
  cost: number;
  /** Raw model ids folded into this family, for the tooltip. */
  variants: string[];
}

export interface AnalyticsAgentRow {
  agentId: string;
  agentName: string;
  runs: number;
  cost: number;
  runtimeMs: number;
  errors: number;
}

export interface AnalyticsProjectRow {
  projectId: string;
  runs: number;
  cost: number;
  runtimeMs: number;
}

export interface ToolRow {
  name: string;
  calls: number;
  runs: number;
}

/** One cell of the 7x24 activity grid. */
export interface ActivityCell {
  /** 0 = Sunday. */
  dow: number;
  /** 0-23, local time. */
  hour: number;
  runs: number;
  cost: number;
}

export interface SeriesPoint {
  /** Bucket key — `YYYY-MM-DD` for day granularity, `YYYY-MM-DD` (week start) for week. */
  key: string;
  cost: number;
  runs: number;
  runtimeMs: number;
}

export interface AnalyticsPage {
  totals: AnalyticsTotals;
  /** Same-length window immediately before `start`. Drives the deltas. */
  previous: AnalyticsTotals;
  /** Null when the window has no meaningful "previous" (all-time). */
  hasPrevious: boolean;
  byModel: ModelFamilyRow[];
  byAgent: AnalyticsAgentRow[];
  byProject: AnalyticsProjectRow[];
  byTool: ToolRow[];
  activity: ActivityCell[];
  series: SeriesPoint[];
  seriesGranularity: "day" | "week";
}

export interface PageRange {
  start: number;
  end: number;
  projectId?: string;
}

export interface AnalyticsSummary {
  totalRuns: number;
  totalTokens: number;
  totalCost: number;
  byModel: Array<{ model: string; runs: number; tokens: number; cost: number }>;
  byAgent: Array<{ agentId: string; agentName: string; runs: number; cost: number }>;
  /** Present only when trailing per-day spend was requested (merged by the API). */
  dailySpend?: Array<{ day: string; spend: number }>;
}

export interface SummaryRange {
  /** Inclusive lower bound (epoch ms). `0` for all-time. */
  start: number;
  /** Exclusive upper bound (epoch ms). `Number.POSITIVE_INFINITY` for all-time. */
  end: number;
  projectId?: string;
}

export interface AccountStats {
  /** `null` = rows written before account_id existed; folded into `default`. */
  accountId: string | null;
  runs24h: number;
  runs7d: number;
  runsAllTime: number;
  cost7dUsd: number;
}

export interface UserAnalysis {
  markdown: string | null;
  updatedAt: string | null;
  wordCount: number | null;
}
