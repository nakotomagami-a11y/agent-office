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
  /** SKILL.md byte size at scan time. */
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
  /** Stable slug id (kebab-case). */
  name: string;
  /** Human-readable name; falls back to the slug if unset. */
  displayName?: string;
  description: string;
  skills: string[];
  tools: string[];
  defaultModel?: string;
  defaultEffort?: string;
  permissionMode?: string;
  room?: string;
  /** Extra dirs the agent can access, passed as --add-dir. */
  addDirs?: string[];
  /** Avatar override "<faction>/<kind>". Unset = hashed from the name. */
  unit?: string;
}

export interface AgentBody {
  name: string;
  id: string;
  desc: string;
  skills: string[];
  tools: string[];
  pm: string;
  model: string;
  effort: string;
  body: string;
  room?: string;
  unit?: string;
}

export interface PersistedRun {
  id: string;
  agentId: string;
  agentName: string;
  ts: number;
  prompt: string;
  status: "running" | "done" | "error";
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
  sessionId?: string;
  parentRunId?: string;
  conversationId?: string;
  accountId?: string;
  currentTool?: string;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

// ─── Server-authoritative chat conversations (see docs/chat-refactor.md) ─────

export type ConversationStatus = "idle" | "running" | "needs_attention";

export interface ConversationQueuedMessage {
  id: string;
  text: string;
  attachments: string | null;
  position: number;
  createdAt: number;
}

export interface ConversationView {
  id: string;
  agentId: string;
  instanceId: string;
  projectId: string | null;
  status: ConversationStatus;
  activeRunId: string | null;
  sessionId: string | null;
  turns: PersistedRun[];
  queue: ConversationQueuedMessage[];
}

/** Live spawn tree node, built from parentRunId links + liveRuns. */
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
  /** Falls back to project.meta.cwd when unset. */
  cwd?: string;
  worktree?: {
    branch: string;   // e.g. "agent/frontend-craftsman-abc1-1716800000000"
    basePath: string; // e.g. "/path/to/project/.worktrees/frontend-craftsman-abc1"
    createdAt: number; // unix ms
  };
  /** Transient: worktree dir missing on disk, shows a "needs repair" badge. */
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
  /** Claude account for this project; undefined/"default" = shared ~/.claude. */
  accountId?: string;
  /** GitHub account whose GH_CONFIG_DIR is injected; undefined/"default" = system gh auth. */
  githubAccountId?: string;
  /** Hidden from the default project picker when true. */
  shelved?: boolean;
}

/** A registered Claude Code account; each has its own CLAUDE_CONFIG_DIR. */
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
  /** True when <configDir>/.credentials.json exists and parses. */
  ready: boolean;
}

/** A registered GitHub account; each has its own GH_CONFIG_DIR. */
export interface GithubAccount {
  id: string;
  label: string;
  configDir: string;
  createdAt: number;
}

export interface GithubAccountWithStatus extends GithubAccount {
  /** Username reported by `gh api user`, when available. */
  username?: string;
  /** True when `gh` reports an authenticated user for this config dir. */
  ready: boolean;
}

/** A reusable secret env var, linked to projects via project_secrets. */
export interface Secret {
  id: string;
  /** Env var name injected into the run. */
  name: string;
  label: string;
  value: string;
  /** Epoch ms; null = never/unknown. */
  expiresAt: number | null;
  /** Shell command to verify validity (optional). */
  testCmd: string | null;
  /** Failed live test blocks the run when true + testCmd set. */
  verifyBeforeRun: boolean;
  lastTestedAt: number | null;
  /** null = untested, true = passed, false = failed. */
  lastTestOk: boolean | null;
  createdAt: number;
}

/** Secret without its raw value. */
export type SecretWithStatus = Omit<Secret, "value"> & {
  /** True when past expiresAt. */
  expired: boolean;
  projectCount: number;
};

export interface AppSettings {
  projectsRoot: string;
  excluded: string[];
  firstRunComplete: boolean;
  features?: {
    multiInstance?: boolean;
  };
  /** Per-integration toggle; absent key = registry default. */
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
  /** 0 for a background-task entry — it never listens on a port. */
  port: number;
  address: string;
  name: string;
  cmd: string;
  cwd: string;
  startedAt: number;
  memMb: number;
  projectId?: string;
  projectName?: string;
  /** Set for a run_in_background Bash-spawned process. */
  source?: "background-task";
  agentId?: string;
  agentName?: string;
  instanceLabel?: string;
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
  hasGit: boolean;
  mtimeMs: number;
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

/** A saved multi-step prompt in the workflow library (DB table: saved_prompts). */
export interface Workflow {
  id: string;
  title: string;
  body: string;
  /** Category slug; "starter" for built-ins. */
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
  /** Session ID from the previous turn, passed as --resume. */
  resumeSessionId?: string;
  /** Defaults to "balanced". */
  contextProfile?: ContextProfile;
  /** Conversation this turn belongs to; undefined for legacy callers. */
  conversationId?: string;
}

export type ContextProfile = "tight" | "balanced" | "deep";

export type ScheduledJobStatus = "pending" | "firing" | "done" | "cancelled" | "needs-attention";
export type ScheduledJobAttention = "stale" | "missing-instance" | "retry-exceeded";

/** A unit of scheduled work: a serialized summon plus the time to fire it. */
export interface ScheduledJob {
  id: string;
  /** Unix ms. Fires on the first tick at or after this time. */
  fireAt: number;
  summonRequest: SummonRequest;
  reason: "manual" | "rate-limit";
  label: string;
  status: ScheduledJobStatus;
  /** Set only when status is needs-attention. */
  attention?: ScheduledJobAttention;
  /** Consecutive rate-limit re-schedules. */
  attempts: number;
  firedRunId?: string;
  createdAt: number;
  updatedAt: number;
}

export type SseEventName = "chunk" | "tool" | "usage" | "done" | "error" | "attached" | "subagent" | "subagent-update" | "rate-limit";

export interface SseChunkEvent { runId: string; text: string }
export interface SseToolEvent { runId: string; name: string; input?: unknown }
export interface SseUsageEvent {
  runId: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  /** New tokens written to the prompt cache this turn. */
  cacheCreationTokens?: number;
  /** Tokens served from cache this turn (discounted rate). */
  cacheReadTokens?: number;
}
export interface SseDoneEvent { runId: string; exitCode: number; sessionId?: string; durationMs?: number; tokensIn?: number; tokensOut?: number; cost?: number }
export type { RunErrorCode } from "../config/run-errors";
import type { RunErrorCode } from "../config/run-errors";
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

// ─── Pipeline types ───────────────────────────────────────────────────────────

export interface PipelineStep {
  agentId: string;
  instanceId?: string;
  /** May contain {{output}}, replaced by the previous step's output. */
  promptTemplate: string;
  model?: string;
  effort?: string;
}

/** A group of steps that run concurrently; outputs join for the next step. */
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
  /** Steps with the same value run concurrently. */
  parallelGroup?: number;
}

export interface PipelineRun {
  id: string;
  projectId?: string;
  steps: PipelineRunStep[];
  status: "running" | "done" | "error";
  createdAt: number;
  /** True when the server restarted mid-run. */
  interrupted?: boolean;
}

/** A project tab in the Chrome-style tab strip; persisted under ui_settings.tabs-state. */
export interface Tab {
  /** Stable id (uuid), distinct from projectId. */
  id: string;
  projectId: string;
  /** Last-known route within this tab. */
  currentPath: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
}

// ─── Docs contracts ───────────────────────────────────────────────────────────

export interface DocFrontmatter {
  title: string;
  category: DocCategory;
  created: string; // ISO 8601
  updated: string; // ISO 8601
}

export interface DocMeta extends DocFrontmatter {
  /** Agent-id or `_global`. */
  owner: string;
  /** Filename without extension. */
  slug: string;
}

export interface Doc extends DocMeta {
  /** Markdown body, frontmatter stripped. */
  body: string;
}

// ─── Prompt composition ───────────────────────────────────────────────────────
// See composeAppendedPrompt (agents.ts) — the one source of truth these mirror.

export interface PromptSegmentChild {
  key: string;
  name: string;
  sub: string;
  chars: number;
}

export interface PromptSegment {
  key: string;
  name: string;
  /** Segments join with "\n\n" to form the real appended prompt. */
  text: string;
  /** `text` without its "## " heading. Empty when itemized via `children`. */
  body: string;
  sub: string;
  /** True for content agent-office doesn't own / the user can't trim. */
  locked: boolean;
  phase: "always" | "first-turn";
  group?: "skills";
  children?: PromptSegmentChild[];
}

// ─── Context & Cost ───────────────────────────────────────────────────────────
// See services/agents/context-cost.ts for how this is computed.

export interface ContextCostRow {
  key: string;
  name: string;
  sub: string;
  tokensEst: number;
  /** Always true today — a local char-count approximation, never exact. */
  est: boolean;
  /** True for content agent-office doesn't own the size of. */
  locked: boolean;
  group?: "skills";
  /** "always" (default) = resident system prompt. "first-turn" = prior-history injection. */
  phase?: "always" | "first-turn";
}

export interface ContextCostBreakdown {
  agentId: string;
  instanceId: string;
  model: string;
  rows: ContextCostRow[];
  /** Sum of the "always" rows — the headline per-run number. */
  totalTokensEst: number;
  /** Sum of "first-turn" rows; 0 for a fresh instance. */
  firstTurnTokensEst: number;
  costPerRunEst: number;
  costPerWeekEst: number;
  runsPerWeek: number;
  avgTurnsPerSession: number;
  writeRatePerTokUsd: number;
  readRatePerTokUsd: number;
  contextWindowTokens: number;
  windowPct: number;
  /** Other CLAUDE.md/AGENTS.md in the project, informational only. */
  conditionalFiles: Array<{ path: string; tokens: number; lines: number }>;
}

// ─── Skill contracts ──────────────────────────────────────────────────────────

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
  heading: string;
}

export interface SkillIconConfig {
  seed: string;
  iconClass: SkillIconClass;
  /** Opaque "build it yourself" overrides — see @agent-office/pixel-icons WeaponParts. */
  parts?: Record<string, Record<string, string | boolean>>;
}
export type SkillIconMap = Record<string, SkillIconConfig>;

// ─── Analytics contracts ──────────────────────────────────────────────────────

export interface AnalyticsTotals {
  runs: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  runtimeMs: number;
  done: number;
  errors: number;
}

export interface ModelFamilyRow {
  /** Consolidated family key: opus | sonnet | haiku | raw id. */
  family: string;
  label: string;
  runs: number;
  tokens: number;
  cost: number;
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
  /** YYYY-MM-DD, or week-start date for week granularity. */
  key: string;
  cost: number;
  runs: number;
  runtimeMs: number;
}

export interface AnalyticsPage {
  totals: AnalyticsTotals;
  previous: AnalyticsTotals;
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
  dailySpend?: Array<{ day: string; spend: number }>;
}

export interface SummaryRange {
  /** Epoch ms, inclusive. 0 = all-time. */
  start: number;
  /** Epoch ms, exclusive. Number.POSITIVE_INFINITY = all-time. */
  end: number;
  projectId?: string;
}

export interface AccountStats {
  /** null = rows written before account_id existed; folded into "default". */
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
