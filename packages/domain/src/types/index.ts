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
  /** The conversation (server-authoritative chat thread) this run belongs to.
   *  A top-level turn = one run with a conversationId. Sub-agent runs inherit
   *  their parent's. Undefined for legacy rows logged before the refactor. */
  conversationId?: string;
  /** Account whose CLAUDE_CONFIG_DIR the run spawned under (undefined → default). */
  accountId?: string;
  /** Live-only: name of the tool call in flight right now (e.g. "Bash",
   *  "Read", "Grep"). Only ever set while `status === "running"` — sourced
   *  from the in-memory live-run registry, not persisted to the DB. */
  currentTool?: string;
}

// ─── Server-authoritative chat conversations (see docs/chat-refactor.md) ──────
// Pure data shapes only (no service logic) so the CLIENT can import them
// directly — `services/execution/conversation.ts` has real deps
// (better-sqlite3, node:child_process) that must never reach a browser
// bundle. That module's own `ConversationView` is defined in terms of these.

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
  /** Top-level turns (runs), oldest → newest. */
  turns: PersistedRun[];
  /** Pending queued messages, FIFO. */
  queue: ConversationQueuedMessage[];
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
  /** Whether the folder has a `.git` directory. */
  hasGit: boolean;
  /** Directory mtime, ms since epoch — used as an "last touched" hint. */
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
  /** The server-authoritative conversation this turn belongs to (see
   *  execution/conversation.ts). Undefined for callers not yet migrated onto
   *  conversations (legacy /api/summon direct calls, some scheduled jobs) —
   *  those runs simply aren't tracked by the queue/auto-advance driver. */
  conversationId?: string;
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

// ─── Prompt composition ──────────────────────────────────────────────────────
// What agent-office appends to an agent's system prompt. `composeAppendedPrompt`
// (agents.ts) is the one source of truth: the real spawn joins `segment.text`,
// and the Context & Cost tab measures the same segments, so the two can't drift.

export interface PromptSegmentChild {
  /** Stable id, unique within the parent (e.g. a skill name). */
  key: string;
  name: string;
  /** Display sub-line for the cost tab. */
  sub: string;
  /** Characters this child contributes to the parent segment's text. */
  chars: number;
}

export interface PromptSegment {
  /** Stable id (e.g. "identity", "global-memory", "skills"). */
  key: string;
  /** Display name for the cost tab (e.g. "Identity", "Global memory"). */
  name: string;
  /** Exact text this segment contributes, heading included. Segments join
   *  with "\n\n" to form the real appended prompt. */
  text: string;
  /** `text` without its "## " heading — what a cost row sizes. Empty for the
   *  skills segment, which is itemized via `children` instead. */
  body: string;
  /** Display sub-line for the cost tab (path · line count, etc.). */
  sub: string;
  /** True for content whose size agent-office doesn't own / the user can't
   *  trim (project info, the history-note pointer). */
  locked: boolean;
  /** When it's paid for — see ContextCostRow.phase. Appended segments are
   *  always "always" (resident system prompt); first-turn injection is sourced
   *  separately (not composed here). */
  phase: "always" | "first-turn";
  /** Set on the skills segment so the cost tab can group its children. */
  group?: "skills";
  /** Segments the cost tab itemizes further (skills → one row per skill) while
   *  the prompt contributes a single grouped section. */
  children?: PromptSegmentChild[];
}

// ─── Context & Cost ──────────────────────────────────────────────────────────
// What actually goes into an agent's system prompt on every run, and what it
// costs — see `services/agents/context-cost.ts` for how this is computed.

export interface ContextCostRow {
  key: string;
  name: string;
  /** Short descriptive line — file path + line count, skill usage mode, etc. */
  sub: string;
  tokensEst: number;
  /** Always true today: every row here is a local char-count approximation
   *  (see `estimateTokens`), never a number Anthropic has confirmed. Kept as
   *  a field (not dropped) so a future exact source (`count_tokens` API) can
   *  flip specific rows to `false` without changing the shape. */
  est: boolean;
  /** True for content agent-office doesn't own the size of (Claude Code's own
   *  base prompt + CLAUDE.md/AGENTS.md discovery) — nothing to trim here. */
  locked: boolean;
  /** Set on skill rows so the UI can group them under one "Skills" umbrella. */
  group?: "skills";
  /** When this is paid for. "always" (default): resident system prompt,
   *  written to cache once, read every turn — the headline total. "first-turn":
   *  prior-history injection, prepended to the first message of a new thread
   *  only; kept out of the headline so it doesn't inflate the per-run cost. */
  phase?: "always" | "first-turn";
}

export interface ContextCostBreakdown {
  agentId: string;
  instanceId: string;
  model: string;
  rows: ContextCostRow[];
  /** Sum of the `phase: "always"` rows only — the resident system-prompt
   *  overhead. The headline "per run" number. */
  totalTokensEst: number;
  /** Sum of `phase: "first-turn"` rows — extra tokens the FIRST message of a
   *  new thread pays on top of `totalTokensEst` (prior-history injection).
   *  0 for a fresh instance with no history. Shown separately, never folded
   *  into the per-run headline. */
  firstTurnTokensEst: number;
  /** Modeled as: write this content to cache once, read it back on every
   *  subsequent turn of the session (`avgTurnsPerSession`) — the same shape
   *  Anthropic actually bills a `--resume`'d session at. */
  costPerRunEst: number;
  costPerWeekEst: number;
  runsPerWeek: number;
  avgTurnsPerSession: number;
  /** Published per-token cache write/read rates for `model` (USD) — real
   *  Anthropic pricing, not derived/guessed from this agent's own history. */
  writeRatePerTokUsd: number;
  readRatePerTokUsd: number;
  contextWindowTokens: number;
  windowPct: number;
  /** Other CLAUDE.md/AGENTS.md elsewhere in the project, not ancestors of this
   *  instance's cwd — only loaded if the agent's task touches that subtree.
   *  Informational only, never added to `totalTokensEst`. */
  conditionalFiles: Array<{ path: string; tokens: number; lines: number }>;
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
  /**
   * Optional explicit "build it yourself" overrides, e.g.
   * `{ blades: { profile: "katana", guard: "swept" } }`. Opaque to the
   * domain layer — persisted as-is; `@agent-office/pixel-icons` interprets
   * the shape (see its `WeaponParts` type, kept in sync by hand since domain
   * doesn't depend on the generator package).
   */
  parts?: Record<string, Record<string, string | boolean>>;
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
