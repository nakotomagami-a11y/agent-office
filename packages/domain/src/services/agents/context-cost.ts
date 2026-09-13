// "Context & Cost" tab data — what goes into this agent's system prompt each
// run and roughly what it costs, broken down per section.
//
// Two numbers the UI keeps separate: `totalTokensEst` is a local char/4
// estimate of the composed prompt plus native overhead (Claude Code's own
// base prompt + tools, which we can't measure exactly). `costPerRunEst` /
// `costPerWeekEst` price that estimate at published Anthropic cache rates,
// amortized over this instance's real turns/session and runs/week — matching
// how a `--resume`'d session actually bills.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentInstance, ContextCostBreakdown, ContextCostRow, ContextProfile, PersistedRun, Project } from "../../types/index";
import { cacheRatesFor } from "../../config/models";
import { estimateTokens, estimateTokensFromChars } from "../infra/token-estimate";
import { formatPriorContext, getContextMessages } from "../projects/history";
import { findInstance } from "../projects/projects";
import * as db from "../db";
import { agentMcpServerNames } from "./context-cost-measure";
// Re-exported so callers (the API route) only need one import — "Measure
// exactly" is a distinct file for its own reasons (spawns real processes,
// async, takes ~10-15s) but is conceptually part of this same feature.
export { measureAgentContextCost } from "./context-cost-measure";
import { buildAppendedPrompt, composeAppendedPrompt, readAgent } from "./agents";

/** Instance's own worktree cwd if it has one, else the project root.
 *  Deliberately not `projects.resolveInstanceCwd`, which creates/heals git
 *  worktrees — a side effect that must never fire from a cost calculation. */
export function resolveReadonlyCwd(project: Project | null, instance: AgentInstance | null): string | undefined {
  const c = instance?.cwd?.trim();
  if (c) return c;
  return project?.meta.cwd?.trim() || undefined;
}

const CONTEXT_WINDOW_TOKENS = 200_000;

function lineCount(text: string): number {
  return text ? text.split("\n").length : 0;
}

/** Rough placeholder for Claude Code's own base prompt + built-in tools —
 *  nothing exposes their exact size. Exists so the total doesn't pretend the
 *  native layer is free; replaced by a real number once measured (see
 *  `buildNativeRows`). CLAUDE.md/AGENTS.md discovery, unlike this, is real
 *  and gets its own row per file (`discoverContextFiles`). */
const BASE_PROMPT_TOKENS_EST = 9000;
const MAX_DISCOVERY_DEPTH = 8;

interface DiscoveredFile { path: string; tokens: number; lines: number }

/** Every `CLAUDE.md`/`AGENTS.md` Claude Code would discover walking up from
 *  each root (the instance cwd PLUS every `--add-dir` the agent passes — those
 *  dirs get their own discovery too) to the filesystem root. Deduped by path,
 *  each measured on its own. */
function discoverContextFiles(roots: Array<string | undefined>): DiscoveredFile[] {
  const found: DiscoveredFile[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    let dir = root && existsSync(root) ? root : undefined;
    for (let i = 0; dir && i < MAX_DISCOVERY_DEPTH; i++) {
      for (const name of ["CLAUDE.md", "AGENTS.md"]) {
        const p = join(dir, name);
        if (seen.has(p) || !existsSync(p)) continue;
        seen.add(p);
        try {
          const body = readFileSync(p, "utf8");
          found.push({ path: p, tokens: estimateTokens(body), lines: lineCount(body) });
        } catch {
          /* unreadable — skip, not fatal to the estimate */
        }
      }
      const parent = dirname(dir);
      dir = parent === dir ? undefined : parent;
    }
  }
  return found;
}

/** Discovery roots for an agent+instance: its real cwd plus every `--add-dir`
 *  the agent declares (tildes expanded), matching buildClaudeArgs. */
function discoveryRoots(cwd: string | undefined, addDirs: string[]): Array<string | undefined> {
  return [cwd, ...addDirs.map((d) => d.replace(/^~/, homedir()))];
}

const NESTED_SCAN_MAX_DEPTH = 6;
const NESTED_SCAN_SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".worktrees", "dist", "build", "out", "target", "vendor", "coverage",
]);

/** Every `CLAUDE.md`/`AGENTS.md` under the project root not already in
 *  `excludePaths` (the ancestor walk-up's finds, already priced in). Claude
 *  Code only discovers these if the agent's task touches that subtree (e.g.
 *  a Next.js app's own `apps/web/AGENTS.md`) — real but conditional, so kept
 *  out of the always-on total. Depth- and dir-bounded against `node_modules`. */
function discoverConditionalFiles(projectRoot: string | undefined, excludePaths: Set<string>): DiscoveredFile[] {
  if (!projectRoot || !existsSync(projectRoot)) return [];
  const found: DiscoveredFile[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > NESTED_SCAN_MAX_DEPTH) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (NESTED_SCAN_SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
      const p = join(dir, entry);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(p, depth + 1);
      } else if ((entry === "CLAUDE.md" || entry === "AGENTS.md") && !excludePaths.has(p)) {
        try {
          const body = readFileSync(p, "utf8");
          found.push({ path: p, tokens: estimateTokens(body), lines: lineCount(body) });
        } catch {
          /* unreadable — skip */
        }
      }
    }
  }

  walk(projectRoot, 0);
  // Drop gitignored matches (e.g. a Tauri sidecar's bundled server tree) —
  // build-artifact duplicates, checked only on the few candidates found here.
  if (found.length === 0) return found;
  try {
    const ignored = execFileSync("git", ["-C", projectRoot, "check-ignore", ...found.map((f) => f.path)], {
      encoding: "utf8",
    });
    const ignoredSet = new Set(ignored.split("\n").map((l) => l.trim()).filter(Boolean));
    return found.filter((f) => !ignoredSet.has(f.path));
  } catch (err) {
    // `check-ignore` exits 1 when nothing matched — not a real error, and its
    // (empty) stdout is still on the error object; only fall back unfiltered
    // on an actual failure (not a git repo, etc).
    const stdout = (err as { stdout?: Buffer | string }).stdout;
    if (stdout === undefined) return found;
    const ignoredSet = new Set(String(stdout).split("\n").map((l) => l.trim()).filter(Boolean));
    return found.filter((f) => !ignoredSet.has(f.path));
  }
}

/** A measured stand-in for `BASE_PROMPT_TOKENS_EST`, from real history. The
 *  first run of a fresh conversation (nothing to `--resume` from yet) writes
 *  its ENTIRE system prompt to the cache in one shot — native overhead +
 *  everything agent-office appends. Every piece but native is already
 *  measured elsewhere, so `measured - knownTokens` isolates native for real.
 *  Picks the most recent qualifying fresh start, so it tracks current config
 *  rather than a stale one. Undefined if no such run exists yet. */
function latestFreshStartCacheCreation(history: PersistedRun[]): number | undefined {
  const earliestByConv = new Map<string, PersistedRun>();
  for (const r of history) {
    if (!r.conversationId) continue;
    const cur = earliestByConv.get(r.conversationId);
    if (!cur || r.ts < cur.ts) earliestByConv.set(r.conversationId, r);
  }
  const best = Array.from(earliestByConv.values())
    .filter((r): r is PersistedRun & { cacheCreationTokens: number } =>
      typeof r.cacheCreationTokens === "number" && r.cacheCreationTokens > 0)
    .sort((a, b) => b.ts - a.ts)[0];
  return best?.cacheCreationTokens;
}

/** A measurement smaller than this is treated as noise (config drift since
 *  that session started, a weirdly small first turn, etc.) rather than a
 *  real near-zero native cost — falls back to the placeholder instead of
 *  showing an implausible number. */
const MIN_PLAUSIBLE_NATIVE_TOKENS = 500;

/** Average top-level turns per conversation, from this agent+instance's own
 *  run history — legacy runs with no `conversationId` count as one bucket
 *  each (can't tell which session they belonged to). Falls back to 1 (no
 *  amortization) when there's no history yet. */
function averageTurnsPerSession(runs: PersistedRun[]): number {
  const byConv = new Map<string, number>();
  let legacy = 0;
  for (const r of runs) {
    if (r.conversationId) byConv.set(r.conversationId, (byConv.get(r.conversationId) ?? 0) + 1);
    else legacy++;
  }
  const counts = Array.from(byConv.values());
  for (let i = 0; i < legacy; i++) counts.push(1);
  if (counts.length === 0) return 1;
  return counts.reduce((a, b) => a + b, 0) / counts.length;
}

function runsInLastDays(runs: PersistedRun[], days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return runs.filter((r) => r.ts >= cutoff).length;
}

/** Accurate token count of everything in a run's prompt that is NOT native
 *  overhead: CLAUDE.md/AGENTS.md discovery plus the whole appended prompt.
 *  Used to isolate native overhead by subtraction — both the history-based
 *  estimate and "Measure exactly" reuse this so they can't diverge. Measures
 *  the real composed string (not a sum of per-section estimates, which would
 *  miss headers/wrapper text and overstate native by that much). */
export function nonNativeKnownTokens(agentId: string, project: Project | null, cwd: string | undefined, addDirs: string[]): number {
  const appended = buildAppendedPrompt(agentId, project, undefined, false);
  const discovered = discoverContextFiles(discoveryRoots(cwd, addDirs)).reduce((a, f) => a + f.tokens, 0);
  return estimateTokens(appended) + discovered;
}

/** Every appended-prompt section except native overhead, one row each, plus
 *  discovered CLAUDE.md/AGENTS.md files. Rows come straight from
 *  `composeAppendedPrompt`'s segments — the same ones the real spawn sends —
 *  so this can't drift from the actual prompt. Skills expand to one row per
 *  child; other segments are sized from `body` (heading excluded, so the sum
 *  of these rows runs a hair under the real total — see `nonNativeKnownTokens`
 *  for the authoritative figure). */
function buildKnownRows(agentId: string, project: Project | null, cwd: string | undefined, addDirs: string[]): ContextCostRow[] {
  const rows: ContextCostRow[] = [];

  for (const file of discoverContextFiles(discoveryRoots(cwd, addDirs))) {
    rows.push({
      key: `discovered-${file.path}`, name: file.path.split("/").pop() ?? file.path,
      sub: `${file.path} · ${file.lines} lines · discovered by Claude Code`,
      tokensEst: file.tokens, est: true, locked: false,
    });
  }

  for (const seg of composeAppendedPrompt(agentId, project)) {
    if (seg.children) {
      for (const child of seg.children) {
        rows.push({
          key: child.key, name: child.name, sub: child.sub,
          tokensEst: estimateTokensFromChars(child.chars), est: true, locked: seg.locked, group: seg.group,
        });
      }
    } else {
      rows.push({
        key: seg.key, name: seg.name, sub: seg.sub,
        tokensEst: estimateTokens(seg.body), est: true, locked: seg.locked,
      });
    }
  }

  return rows;
}

/** Native-overhead row(s), best source first: a real "Measure exactly" result
 *  (split into CC base+tools and, if declared, a separate MCP row) > a
 *  history-based measurement (real, but not decomposed) > the flat
 *  placeholder. Only one wins per call — exact measurement, once it exists,
 *  is strictly better than the history-based guess of the same quantity. */
function buildNativeRows(
  agentId: string,
  tools: string[],
  knownTokens: number,
  history: PersistedRun[],
): ContextCostRow[] {
  const exact = db.getAgentContextMeasurement(agentId);
  if (exact) {
    const rows: ContextCostRow[] = [{
      key: "native-cc", name: "CC base + built-in tools",
      sub: "Claude Code's own system prompt + Read/Write/Edit/Bash/etc. — measured, not owned by agent-office",
      tokensEst: exact.ccBaseAndToolsTokens, est: false, locked: true,
    }];
    if (exact.mcpServerNames.length > 0 && exact.mcpTokens > 0) {
      // est: true (from the server's tools/list, not the probe — see
      // context-cost-measure.ts). locked: false — unlike CC's own
      // base+tools, MCP cost is trimmable by removing the tool.
      rows.push({
        key: "native-mcp", name: `MCP: ${exact.mcpServerNames.join(", ")}`,
        sub: "tool schemas loaded on turn 2+ of every session — trimmable by removing the mcp__ tool from the agent",
        tokensEst: exact.mcpTokens, est: true, locked: false,
      });
    }
    return rows;
  }

  const mcpServers = agentMcpServerNames(tools);
  const mcpNote = mcpServers.length > 0 ? ` + MCP: ${mcpServers.join(", ")}` : "";

  const freshStartTotal = latestFreshStartCacheCreation(history);
  const measured = freshStartTotal !== undefined ? freshStartTotal - knownTokens : undefined;
  if (measured !== undefined && measured >= MIN_PLAUSIBLE_NATIVE_TOKENS) {
    return [{
      key: "native", name: "Native overhead",
      sub: `CC base prompt + built-in tools${mcpNote} — measured from a real session start (click "Measure exactly" to split this up)`,
      tokensEst: measured, est: false, locked: true,
    }];
  }
  return [{
    key: "native", name: "Native overhead",
    sub: `CC base prompt + built-in tools${mcpNote} — no measurement yet, rough estimate`,
    tokensEst: BASE_PROMPT_TOKENS_EST, est: true, locked: true,
  }];
}

/** The prior-history row agent-office prepends to the FIRST message of a new
 *  thread (see summon-run.ts buildPriorContext / history.formatPriorContext).
 *  Real, but paid once per session in the USER message — hence
 *  `phase: "first-turn"`, kept out of the always-on system-prompt total.
 *  Returns null when this instance has no history to inject yet (fresh). */
function buildPriorHistoryRow(agentId: string, instanceId: string, project: Project | null): ContextCostRow | null {
  try {
    const profile: ContextProfile = "balanced";
    const msgs = getContextMessages({
      agentId, instanceId, projectId: project?.id, profile, currentPrompt: "continue the previous task",
    });
    if (msgs.length === 0) return null;
    const tokens = estimateTokens(formatPriorContext(msgs, profile));
    if (tokens <= 0) return null;
    return {
      key: "prior-history", name: "Prior history",
      sub: `${msgs.length} recent message${msgs.length === 1 ? "" : "s"} (balanced) — first turn of a NEW thread only, not on resume`,
      tokensEst: tokens, est: true, locked: false, phase: "first-turn",
    };
  } catch {
    return null;
  }
}

export function buildContextCostBreakdown(opts: {
  agentId: string;
  instanceId?: string;
  project: Project | null;
}): ContextCostBreakdown {
  const { agentId, project } = opts;
  const instanceId = opts.instanceId && opts.instanceId.length > 0 ? opts.instanceId : "default";
  const agent = readAgent(agentId);
  const model = agent?.info.defaultModel || "sonnet";
  const addDirs = agent?.info.addDirs ?? [];

  // Discovery root matches what this instance's real runs would see: its own
  // worktree cwd (or the project root) plus any --add-dir the agent passes.
  const instance = findInstance(project, instanceId === "default" ? undefined : instanceId);
  const cwd = resolveReadonlyCwd(project, instance);

  const history = db.listRuns({ agentId, instanceId, limit: 200 }).filter((r) => !r.parentRunId);

  const knownRows = buildKnownRows(agentId, project, cwd, addDirs);
  // Subtract the accurate total (nonNativeKnownTokens), not the sum of the
  // display rows above — keeps native honest despite their header residual.
  const knownTokens = nonNativeKnownTokens(agentId, project, cwd, addDirs);
  const nativeRows = buildNativeRows(agentId, agent?.info.tools ?? [], knownTokens, history);
  const priorRow = buildPriorHistoryRow(agentId, instanceId, project);

  // Other CLAUDE.md/AGENTS.md in the project, real but conditional on what
  // the agent's task touches — reported separately, never priced in.
  const discoveredPaths = new Set(discoverContextFiles(discoveryRoots(cwd, addDirs)).map((f) => f.path));
  const conditionalFiles = discoverConditionalFiles(project?.meta.cwd, discoveredPaths);

  const alwaysRows = [...nativeRows, ...knownRows].sort((a, b) => b.tokensEst - a.tokensEst);
  const rows = priorRow ? [...alwaysRows, priorRow] : alwaysRows;
  // Headline total is the resident system prompt only — prior-history is
  // paid once in the user message, a different billing shape, so it's kept
  // out and reported separately as firstTurnTokensEst.
  const totalTokensEst = alwaysRows.reduce((a, r) => a + r.tokensEst, 0);
  const firstTurnTokensEst = priorRow?.tokensEst ?? 0;

  const avgTurnsPerSession = averageTurnsPerSession(history);
  const runsPerWeek = runsInLastDays(history, 7);
  const rates = cacheRatesFor(model);
  const perTokenAllIn = rates.write + rates.read * Math.max(1, avgTurnsPerSession);
  const costPerRunEst = totalTokensEst * perTokenAllIn;

  return {
    agentId,
    instanceId,
    model,
    rows,
    totalTokensEst,
    firstTurnTokensEst,
    costPerRunEst,
    costPerWeekEst: costPerRunEst * runsPerWeek,
    runsPerWeek,
    avgTurnsPerSession,
    writeRatePerTokUsd: rates.write,
    readRatePerTokUsd: rates.read,
    contextWindowTokens: CONTEXT_WINDOW_TOKENS,
    windowPct: (totalTokensEst / CONTEXT_WINDOW_TOKENS) * 100,
    conditionalFiles,
  };
}
