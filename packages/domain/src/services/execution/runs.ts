// Live run registry. Spawns `claude` subprocesses, parses stream-json output,
// and broadcasts events to subscribed SSE writers.
//
// Each subscriber is a callback (`SseEmit`) instead of a websocket - works with
// `apps/web/src/lib/sse.ts` writers and any other consumer.
//
// This module owns the stateful run machine (the `liveRuns` singleton, spawn,
// stream handling, sub-agent record-keeping, finalize). Pure helpers live
// alongside in `./runs/`: types, error classification, and sub-agent parsing.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { PersistedRun, SubAgentStatus, WorkflowNode } from "../../types/index";
import { log } from "../infra/log";
import { buildAugmentedPath, DEFAULT_ACCOUNT_ID, DEFAULT_GITHUB_ACCOUNT_ID } from "../infra/paths";
import { pushRun, getRun, isRunOrphaned, markRunAborted } from "../infra/store";
import { appendRun as appendHistory } from "../projects/history";
import * as db from "../db";
import * as accounts from "../accounts/accounts";
import * as githubAccounts from "../accounts/github-accounts";
import * as secrets from "../accounts/secrets";
import { readProject } from "../projects/projects";
import { acquireInhibit, releaseInhibit, forceReleaseInhibit } from "../infra/sleep-inhibit";
import type { LiveRun, ReplayableEvent, SseEmit, SseEvent, StartRunOpts, StreamEvent } from "./runs/types";
import { buildRateLimitEvent, classifyResultError, classifySpawnError, detectRateLimitResult } from "./runs/errors";
import { detectSubAgentSpawn, stringifyToolResult } from "./runs/subagent-parse";

// Re-export the public surface so `@agent-office/domain/services/runs` and the
// services barrel keep resolving these names after the split.
export type { SseEvent, SseEmit, StartRunOpts } from "./runs/types";
export { buildRateLimitEvent } from "./runs/errors";
export { detectSubAgentSpawn, parseClaudeBashSpawn } from "./runs/subagent-parse";

// Hard wall-clock cap. The process is "active" as long as it is alive —
// stdout silence is not inactivity (Claude may be waiting on a long bash tool).
const MAX_WALL_CLOCK_MS = 4 * 60 * 60_000; // 4-hour safety cap

declare global {
  // eslint-disable-next-line no-var
  var __agentOfficeLiveRuns: Map<string, LiveRun> | undefined;
  // eslint-disable-next-line no-var
  var __agentOfficeRunsInstalled: boolean | undefined;
  // Indirection so the signal handler always invokes the *current* module's
  // killAllRuns - without this, HMR replaces the function but the SIGINT
  // handler stays bound to the old one and our new finalize-on-kill logic
  // never runs until the dev server is fully restarted.
  // eslint-disable-next-line no-var
  var __agentOfficeKillAllRuns: (() => void) | undefined;
}

const liveRuns: Map<string, LiveRun> =
  globalThis.__agentOfficeLiveRuns ??
  (globalThis.__agentOfficeLiveRuns = new Map());

const RUN_RETENTION_MS = 4 * 60 * 60_000;

function gc(): void {
  const now = Date.now();
  const cutoff = now - RUN_RETENTION_MS;
  for (const [id, run] of liveRuns) {
    if (run.status !== "running" && (run.finishedAt ?? 0) < cutoff) {
      liveRuns.delete(id);
      continue;
    }
    if (run.status === "running" && now - run.startTs > MAX_WALL_CLOCK_MS) {
      log.warn("run.wall_clock_exceeded", { runId: id, wallMs: now - run.startTs });
      broadcast(run, { name: "error", data: { runId: id, code: "max_runtime" } });
      try { run.proc.kill(); } catch { /* already gone */ }
    }
  }
}

// Always keep the current module's killAllRuns in the global slot. HMR
// replaces the function reference each reload; the handlers below read
// through the global so the latest version always wins.
globalThis.__agentOfficeKillAllRuns = killAllRuns;

if (!globalThis.__agentOfficeRunsInstalled) {
  setInterval(gc, 60_000).unref();
  process.on("SIGINT", () => {
    globalThis.__agentOfficeKillAllRuns?.();
  });
  process.on("SIGTERM", () => {
    globalThis.__agentOfficeKillAllRuns?.();
  });
  globalThis.__agentOfficeRunsInstalled = true;
}

export function getLiveRun(runId: string): LiveRun | undefined {
  return liveRuns.get(runId);
}

export function getLiveRunAsPersistedRun(runId: string): PersistedRun | undefined {
  const r = liveRuns.get(runId);
  if (!r) return undefined;
  return {
    id: r.id,
    agentId: r.agentId,
    agentName: r.agentName,
    ts: r.startTs,
    prompt: r.prompt,
    status: r.status,
    exitCode: r.exitCode,
    output: r.output,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    cost: r.cost,
    durMs: Date.now() - r.startTs,
    model: r.model,
    effort: r.effort,
    cwd: r.cwd,
    projectId: r.projectId,
    instanceId: r.instanceId,
    instanceLabel: r.instanceLabel,
    sessionId: r.sessionId,
    parentRunId: r.parentRunId,
    currentTool: r.currentTool,
  };
}

/**
 * Build the spawn tree rooted at `rootId` by walking `parentRunId` links in the
 * DB and overlaying in-flight `liveRuns` state (fresher tokens/cost/status for
 * runs still streaming). Depth-capped and cycle-guarded. Returns null when the
 * root run is unknown.
 */
export function buildRunTree(rootId: string, maxDepth = 6): WorkflowNode | null {
  const visited = new Set<string>();

  const toNode = (run: PersistedRun, depth: number): WorkflowNode => {
    visited.add(run.id);
    const live = liveRuns.get(run.id);
    const status = live?.status ?? run.status;
    const durMs = live
      ? (live.status === "running" ? Date.now() - live.startTs : (live.finishedAt ?? Date.now()) - live.startTs)
      : run.durMs;

    const children: WorkflowNode[] =
      depth >= maxDepth
        ? []
        : db
            .getChildRuns(run.id)
            .filter((c) => !visited.has(c.id))
            .map((c) => toNode(c, depth + 1));

    return {
      runId: run.id,
      agentId: run.agentId,
      agentName: run.agentName,
      status,
      prompt: run.prompt,
      startTs: run.ts,
      durMs,
      tokensIn: live?.tokensIn ?? run.tokensIn,
      tokensOut: live?.tokensOut ?? run.tokensOut,
      cost: live?.cost ?? run.cost,
      children,
    };
  };

  const root = getLiveRunAsPersistedRun(rootId) ?? db.getRun(rootId);
  if (!root) return null;
  return toNode(root, 0);
}

export function getRunningRuns(): PersistedRun[] {
  return Array.from(liveRuns.values())
    .filter((r) => r.status === "running")
    .map((r): PersistedRun => ({
      id: r.id,
      agentId: r.agentId,
      agentName: r.agentName,
      ts: r.startTs,
      prompt: r.prompt,
      status: "running",
      output: r.output,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      cost: r.cost,
      durMs: Date.now() - r.startTs,
      model: r.model,
      effort: r.effort,
      cwd: r.cwd,
      projectId: r.projectId,
      instanceId: r.instanceId,
      instanceLabel: r.instanceLabel,
      currentTool: r.currentTool,
    }));
}

/**
 * Is there already a live, running `claude` process for this exact target
 * (same agentId + instanceId — the same slot `transcriptKey()` on the client
 * uses to key a conversation)? Used by `startSummonRun` as a spawn guard.
 *
 * Why this exists: the client is supposed to serialize sends per target (see
 * `useQueueDrain` in `use-chat-actions.ts`) and never issue a second
 * `/api/summon` for a target that already has an active run. But a project-tab
 * switch can unmount the `ChatPanel` mid-request, and TanStack Query's
 * `MutationObserver` drops the *per-call* `.mutate(vars, { onSuccess })`
 * callback once its last subscriber (the unmounted component) is gone — the
 * POST still completes and this module still spawns the process, but the
 * client never learns the new `runId` and is left with `activeRunId: null`.
 * If the user then retries (e.g. "New Thread" + resend), nothing on the
 * client stops a second `/api/summon` for the same target — the first
 * process is still running, orphaned but alive. This function is the
 * backend-side backstop: it makes "one live run per target" true regardless
 * of what the client does or fails to track.
 */
export function findActiveRunForTarget(
  agentId: string,
  instanceId: string | undefined,
): { runId: string; prompt: string } | undefined {
  for (const run of liveRuns.values()) {
    if (run.status !== "running") continue;
    if (run.agentId !== agentId) continue;
    if (run.instanceId !== instanceId) continue;
    return { runId: run.id, prompt: run.prompt };
  }
  return undefined;
}

/**
 * Force a spawned git process to authenticate github.com as the account whose
 * dir is in `env.GH_CONFIG_DIR`, using git's `GIT_CONFIG_*` env mechanism so
 * nothing on disk (the user's global ~/.gitconfig) is mutated. We append two
 * entries after any pre-existing GIT_CONFIG_COUNT: an empty value to reset the
 * github.com helper list (clobbering any OS-cached / global helper that would
 * otherwise win), then `!gh auth git-credential`, which reads GH_CONFIG_DIR at
 * runtime. `gh` is resolved via the augmented PATH already set on `env`.
 */
function applyGitCredentialHelper(env: NodeJS.ProcessEnv): void {
  const base = Number.parseInt(env.GIT_CONFIG_COUNT ?? "", 10);
  const start = Number.isNaN(base) || base < 0 ? 0 : base;
  env[`GIT_CONFIG_KEY_${start}`] = "credential.https://github.com.helper";
  env[`GIT_CONFIG_VALUE_${start}`] = "";
  env[`GIT_CONFIG_KEY_${start + 1}`] = "credential.https://github.com.helper";
  env[`GIT_CONFIG_VALUE_${start + 1}`] = "!gh auth git-credential";
  env.GIT_CONFIG_COUNT = String(start + 2);
}

/**
 * Resolve the effective account for a run and return the spawn env. Explicit
 * `opts.accountId` beats the project's accountId. `default` (or missing) →
 * no CLAUDE_CONFIG_DIR is set, and the child inherits the shared ~/.claude.
 *
 * Exported for unit testing (env plumbing is the entire multi-account
 * spawn contract). `startRun` is the sole production caller.
 */
export function resolveSpawnEnv(opts: StartRunOpts): { env: NodeJS.ProcessEnv; accountId: string | undefined } {
  const explicit = opts.accountId;
  // Read the project once — both accountId and githubAccountId come off it.
  const project = opts.projectId ? readProject(opts.projectId) : undefined;
  const fromProject = !explicit ? project?.meta.accountId : undefined;
  const resolvedId = explicit ?? fromProject;
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: buildAugmentedPath() };
  if (resolvedId && resolvedId !== DEFAULT_ACCOUNT_ID) {
    const account = accounts.get(resolvedId);
    if (account) {
      env.CLAUDE_CONFIG_DIR = account.configDir;
    } else {
      log.warn("run.account_missing", { runId: opts.projectId, accountId: resolvedId });
    }
  }

  // Per-project GitHub account: inject GH_CONFIG_DIR so every git/gh command the
  // agent runs uses that identity. Only ever sourced from the project (no
  // explicit opts override). `default`/unset → no injection → inherit system gh.
  const githubAccountId = project?.meta.githubAccountId;
  if (githubAccountId && githubAccountId !== DEFAULT_GITHUB_ACCOUNT_ID) {
    const githubAccount = githubAccounts.get(githubAccountId);
    if (githubAccount) {
      env.GH_CONFIG_DIR = githubAccount.configDir;
      // GH_CONFIG_DIR only redirects the `gh` CLI. `git push/fetch` over HTTPS
      // authenticate via git's credential system, which ignores GH_CONFIG_DIR —
      // so without this, git falls back to whatever the machine's global git
      // config / OS credential store cached (the WRONG account) and fails with
      // "Repository not found". We inject the credential helper directly into
      // the child's env with GIT_CONFIG_* (never touching the user's global
      // ~/.gitconfig): reset the github.com helper list, then set
      // `gh auth git-credential`, which resolves its token from GH_CONFIG_DIR at
      // runtime. Scoped to this spawn and gated on a non-default account, so the
      // default/system-gh path is untouched.
      applyGitCredentialHelper(env);
    } else {
      log.warn("run.github_account_missing", { projectId: opts.projectId, githubAccountId });
    }
  }

  // Per-project secrets: inject each linked secret as its named env var. Free-
  // form — `env[name] = value` verbatim (see secrets.ts). Only sourced from the
  // project; a run with no projectId gets none.
  if (opts.projectId) {
    for (const secret of secrets.listRawForProject(opts.projectId)) {
      env[secret.name] = secret.value;
    }
  }

  return { env, accountId: resolvedId };
}

export function startRun(opts: StartRunOpts): { runId: string } {
  const runId = randomUUID();
  const { env, accountId } = resolveSpawnEnv(opts);
  const proc = spawn("claude", opts.args, {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: opts.cwd,
    env,
  });
  const run: LiveRun = {
    id: runId,
    agentId: opts.agentId,
    agentName: opts.agentName,
    startTs: Date.now(),
    prompt: opts.prompt,
    model: opts.model,
    effort: opts.effort,
    cwd: opts.cwd,
    projectId: opts.projectId,
    instanceId: opts.instanceId,
    instanceLabel: opts.instanceLabel,
    output: "",
    tokensIn: 0,
    tokensOut: 0,
    cost: 0,
    status: "running",
    proc,
    subscribers: new Set(),
    parseFailures: 0,
    sawStreamDelta: false,
    args: opts.args,
    stderrBuf: "",
    lastActivityAt: Date.now(),
    eventLog: [],
    parentRunId: opts.parentRunId,
    childRunIds: [],
    subAgents: new Map(),
  };
  liveRuns.set(runId, run);
  acquireInhibit();

  db.insertRun({
    id: runId,
    agentId: opts.agentId,
    agentName: opts.agentName,
    instanceId: opts.instanceId,
    instanceLabel: opts.instanceLabel,
    projectId: opts.projectId,
    sessionId: undefined,
    status: "running",
    prompt: opts.prompt,
    model: opts.model,
    effort: opts.effort,
    cwd: opts.cwd,
    startedAt: run.startTs,
    parentRunId: opts.parentRunId,
    accountId,
  });

  log.info("run.start", { runId, agent: opts.agentId, cwd: opts.cwd, accountId });

  pumpStdout(run);
  pumpStderr(run);
  // Use 'close' not 'exit': 'exit' fires before stdout finishes draining,
  // so the final 'result' line (which carries session_id) may not be
  // processed yet. 'close' guarantees all stdio streams have ended first.
  proc.on("close", (code) => {
    // If --resume failed because the session no longer exists (different cwd,
    // server restart, etc.), retry once without the --resume flag so the agent
    // starts a fresh session instead of erroring out.
    if (
      code === 1 &&
      run.stderrBuf.includes("No conversation found with session ID") &&
      run.args.includes("--resume")
    ) {
      const resumeIdx = run.args.indexOf("--resume");
      const retryArgs = resumeIdx === -1 ? run.args : [
        ...run.args.slice(0, resumeIdx),
        ...run.args.slice(resumeIdx + 2), // drop "--resume" and the session ID value after it
      ];
      log.info("run.retry_no_resume", { runId: run.id });
      const retryProc = spawn("claude", retryArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: run.cwd,
        env,
      });
      run.proc = retryProc;
      run.stderrBuf = "";
      pumpStdout(run);
      pumpStderr(run);
      retryProc.on("close", (retryCode) => finalizeRun(run, retryCode ?? 1));
      retryProc.on("error", (err) => {
        broadcast(run, { name: "error", data: { runId: run.id, ...classifySpawnError(err, run.cwd) } });
        if (run.status === "running") finalizeRun(run, 1);
      });
      return;
    }
    finalizeRun(run, code ?? 1);
  });
  proc.on("error", (err) => {
    broadcast(run, { name: "error", data: { runId: run.id, ...classifySpawnError(err, run.cwd) } });
    if (run.status === "running") {
      finalizeRun(run, 1);
    }
  });

  return { runId };
}

export function attachEmit(runId: string, emit: SseEmit): boolean {
  const run = liveRuns.get(runId);
  if (!run) return false;
  run.subscribers.add(emit);
  // Send metadata via `attached` with empty output — the full event log replay
  // below rebuilds the thread in the correct order (chunks interleaved with
  // tool calls), so sending output text here would duplicate it.
  void emit({
    name: "attached",
    data: {
      runId,
      output: "",
      tokensIn: run.tokensIn,
      tokensOut: run.tokensOut,
      cost: run.cost,
      status: run.status,
      startTs: run.startTs,
    },
  });
  // Replay all recorded events so the client reconstructs the full thread —
  // including tool groups that fired while no subscriber was watching.
  for (const event of run.eventLog) {
    void emit(event);
  }
  if (run.status !== "running") {
    void emit({
      name: "done",
      data: {
        runId,
        exitCode: run.exitCode ?? 0,
        sessionId: run.sessionId,
        durationMs: run.finishedAt !== undefined ? run.finishedAt - run.startTs : undefined,
        tokensIn: run.tokensIn,
        tokensOut: run.tokensOut,
        cost: run.cost,
      },
    });
  }
  return true;
}

export function detachEmit(runId: string, emit: SseEmit): void {
  liveRuns.get(runId)?.subscribers.delete(emit);
}

/**
 * Terminal SSE events for a run that is NOT in the live emit registry, derived
 * from persisted state so a reconnecting stream still gets a correct outcome.
 * Marks genuine orphans aborted as a side effect. Callers just write the events.
 *
 * A "running" persisted row means another server process owns it: only declare
 * it dead if that process is actually gone (orphan) - otherwise the run is alive
 * but unreachable from this worker, and killing it would fake a failure.
 */
export function resolveDetachedRunEvents(runId: string): SseEvent[] {
  const persisted = getRun(runId);
  if (!persisted) {
    return [
      { name: "error", data: { runId, code: "unknown", detail: runId } },
      { name: "done", data: { runId, exitCode: 1 } },
    ];
  }

  const stillRunning = persisted.status === "running";
  const orphaned = stillRunning && isRunOrphaned(runId);
  if (orphaned) markRunAborted(runId);

  // Alive on another worker (e.g. dev server restarted mid-run). Not a failure -
  // its real result lands in history when it finishes; this stream just can't follow it.
  if (stillRunning && !orphaned) {
    return [
      { name: "error", data: { runId, code: "server_restart" } },
      { name: "done", data: { runId, exitCode: 1, sessionId: persisted.sessionId } },
    ];
  }

  // markRunAborted moved an orphan row to error/-1; `persisted` is the stale
  // pre-update snapshot, so derive the outcome from `orphaned` too.
  const exitCode = orphaned ? -1 : persisted.exitCode ?? null;
  const failed = orphaned || persisted.status === "error" || (exitCode != null && exitCode !== 0);
  const events: SseEvent[] = [];
  if (failed) {
    events.push({
      name: "error",
      data: orphaned
        ? { runId, code: "server_restart", interrupted: true }
        : { runId, code: "unknown" },
    });
  }
  events.push({ name: "done", data: { runId, exitCode: exitCode ?? (failed ? 1 : 0), sessionId: persisted.sessionId } });
  return events;
}

export function abortRun(runId: string): boolean {
  const run = liveRuns.get(runId);
  if (!run) return false;
  run.aborted = true;
  try {
    run.proc.kill();
  } catch {
    /* already exited */
  }
  return true;
}

export function killAllRuns(): void {
  for (const run of liveRuns.values()) {
    try {
      run.proc.kill();
    } catch {
      /* ignore */
    }
    // Defensively finalise here too - `proc.on('exit')` may not get a turn
    // if Node is about to exit. Without this, in-flight runs at SIGINT time
    // never reach runs.log and a refresh later shows "not_found".
    // finalizeRun is idempotent against status checks, so a real exit
    // landing after this is a no-op.
    if (run.status === "running") {
      finalizeRun(run, 130);
    }
  }
  forceReleaseInhibit();
}

function broadcast(run: LiveRun, event: SseEvent): void {
  if (
    event.name === "chunk" ||
    event.name === "tool" ||
    event.name === "usage" ||
    event.name === "subagent" ||
    event.name === "rate-limit"
  ) {
    run.eventLog.push(event as ReplayableEvent);
  }
  for (const emit of run.subscribers) {
    try {
      void emit(event);
    } catch {
      /* drop bad subscriber on next gc */
    }
  }
}

function pumpStdout(run: LiveRun): void {
  let buf = "";
  run.proc.stdout.on("data", (chunk: Buffer) => {
    run.lastActivityAt = Date.now();
    buf += chunk.toString("utf8");
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) handleStreamLine(run, line);
    }
  });
  run.proc.stdout.on("end", () => {
    if (buf.trim()) handleStreamLine(run, buf.trim());
  });
}

function pumpStderr(run: LiveRun): void {
  run.proc.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    run.stderrBuf += text;
    log.debug("run.stderr", { runId: run.id, text: text.slice(0, 200) });
  });
}

function handleStreamLine(run: LiveRun, line: string): void {
  let evt: StreamEvent;
  try {
    evt = JSON.parse(line) as StreamEvent;
  } catch {
    run.parseFailures++;
    if (run.parseFailures <= 3) {
      log.warn("run.unparseable_line", { runId: run.id, line: line.slice(0, 200) });
    }
    return;
  }

  if (evt.type === "stream_event" && evt.event) {
    const ev = evt.event;
    if (
      ev.type === "content_block_delta" &&
      ev.delta?.type === "text_delta" &&
      typeof ev.delta.text === "string"
    ) {
      run.sawStreamDelta = true;
      // The model is producing text again, not calling a tool — clear any
      // stale tool name so "what's it doing right now" dashboards don't keep
      // showing e.g. "Bash" long after the call finished and the run moved
      // on to writing a summary.
      run.currentTool = undefined;
      run.output += ev.delta.text;
      broadcast(run, { name: "chunk", data: { runId: run.id, text: ev.delta.text } });
      return;
    }
    if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
      const toolName = ev.content_block.name ?? "tool";
      run.currentTool = toolName;
      broadcast(run, {
        name: "tool",
        data: { runId: run.id, name: toolName, input: ev.content_block.input },
      });
      db.insertToolCall(run.id, toolName, ev.content_block.input, Date.now());
      // Do NOT call spawnSubAgentRecord here — input is always {} at content_block_start.
      // Sub-agent records are created in the assistant event handler where input is complete.
      return;
    }
    return;
  }

  if (evt.type === "assistant" && evt.message?.content) {
    for (const block of evt.message.content) {
      if (block.type === "text" && typeof block.text === "string" && !run.sawStreamDelta) {
        run.currentTool = undefined;
        run.output += block.text;
        broadcast(run, { name: "chunk", data: { runId: run.id, text: block.text } });
      } else if (block.type === "tool_use") {
        const toolName = block.name ?? "tool";
        run.currentTool = toolName;
        // Phase-0 ground-truth probe. Enable with AO_DEBUG_TOOLS=1 to capture the
        // exact tool name / input shape the installed Claude CLI emits for spawns.
        if (process.env.AO_DEBUG_TOOLS) {
          log.info("tool.debug", { runId: run.id, name: toolName, input: block.input });
        }
        broadcast(run, {
          name: "tool",
          data: { runId: run.id, name: toolName, input: block.input },
        });
        db.insertToolCall(run.id, toolName, block.input, Date.now());
        const spawn = detectSubAgentSpawn(toolName, block.input, run.agentId);
        if (spawn) {
          spawnSubAgentRecord(run, block.id, spawn);
        }
      }
    }
    if (evt.message.usage) {
      const ti = evt.message.usage.input_tokens;
      const to = evt.message.usage.output_tokens;
      if (typeof ti === "number") run.tokensIn += ti;
      if (typeof to === "number") run.tokensOut += to;
      broadcast(run, {
        name: "usage",
        data: { runId: run.id, tokensIn: run.tokensIn, tokensOut: run.tokensOut, cost: run.cost },
      });
    }
    return;
  }

  // `user` events carry tool_result blocks. A result for a tool_use that spawned
  // a sub-agent is the terminal signal for that sub-agent's card (native Task /
  // Agent and Bash `claude -p` children run outside liveRuns, so the live bridge
  // never fires for them).
  if (evt.type === "user" && evt.message?.content) {
    for (const block of evt.message.content) {
      if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
        finalizeSubAgentFromResult(run, block.tool_use_id, block);
      }
    }
    return;
  }

  if (evt.type === "rate_limit_event") {
    const event = buildRateLimitEvent(evt.rate_limit_info, run.id);
    if (event) {
      run.rateLimitResetsAt = event.resetsAt;
      // Persist the reset time only on a hard LIMIT so the scheduler can tell a
      // fired auto-resume hit the wall again (→ reschedule) vs finished cleanly.
      if (event.severity === "limit" && event.resetsAt) {
        db.setRunRateLimitResetsAt(run.id, event.resetsAt);
      }
      // Never kill the run here. On an early WARNING the CLI keeps going; on a
      // hard LIMIT the CLI exits on its own if Anthropic blocks it. Either way
      // the card lets the user decide to stop or continue.
      broadcast(run, { name: "rate-limit", data: event });
    }
    return;
  }

  if (evt.type === "result") {
    if (evt.usage) {
      run.tokensIn = evt.usage.input_tokens ?? run.tokensIn;
      run.tokensOut = evt.usage.output_tokens ?? run.tokensOut;
    }
    if (typeof evt.total_cost_usd === "number") run.cost = evt.total_cost_usd;
    if (typeof evt.session_id === "string") run.sessionId = evt.session_id;
    broadcast(run, {
      name: "usage",
      data: { runId: run.id, tokensIn: run.tokensIn, tokensOut: run.tokensOut, cost: run.cost },
    });
    if (evt.is_error) {
      // A user-initiated abort makes the CLI exit with is_error too. Surface it
      // as a neutral "interrupted" card, not a red failure with the whole
      // transcript dumped in as the error message.
      if (run.aborted) {
        broadcast(run, { name: "error", data: { runId: run.id, code: "stopped", interrupted: true } });
      } else {
        // A hit session/usage limit often arrives as a plain is_error result
        // (no structured rate_limit_event). Surface it as a rate-limit card with
        // a countdown + auto-resume, not a generic red failure.
        const rateLimit = detectRateLimitResult(evt.error ?? "", run.output);
        if (rateLimit) {
          const event = { ...rateLimit, runId: run.id };
          run.rateLimitResetsAt = event.resetsAt;
          if (event.resetsAt) db.setRunRateLimitResetsAt(run.id, event.resetsAt);
          broadcast(run, { name: "rate-limit", data: event });
        } else {
          broadcast(run, { name: "error", data: { runId: run.id, ...classifyResultError(evt.error ?? "", run.output) } });
        }
      }
    }
  }
}

const SUB_AGENT_THROTTLE_MS = 500;

function bridgeChildToParent(parentRun: LiveRun, subRunId: string): void {
  const childRun = liveRuns.get(subRunId);
  if (!childRun) return;

  let lastEmitTs = 0;

  const emit: SseEmit = (event) => {
    if (event.name === "chunk" || event.name === "tool" || event.name === "usage" || event.name === "done" || event.name === "error") {
      const now = Date.now();
      const status: SubAgentStatus =
        event.name === "done"
          ? (event.data as { exitCode: number }).exitCode === 0 ? "done" : "error"
          : event.name === "error"
            ? "error"
            : childRun.status === "running" ? "running" : "done";

      const lastLine = childRun.output
        ? childRun.output.trimEnd().split("\n").pop()?.trim() ?? undefined
        : undefined;

      const currentTool = event.name === "tool"
        ? (event.data as { name: string }).name
        : undefined;

      const isDone = event.name === "done" || event.name === "error";

      if (!isDone && now - lastEmitTs < SUB_AGENT_THROTTLE_MS) return;
      lastEmitTs = now;

      broadcast(parentRun, {
        name: "subagent-update",
        data: {
          type: "subagent-update",
          subRunId,
          status,
          currentTool,
          tokensIn: childRun.tokensIn,
          tokensOut: childRun.tokensOut,
          cost: childRun.cost,
          lastOutputLine: lastLine,
        },
      });

      if (isDone) {
        childRun.subscribers.delete(emit);
      }
    }
  };

  childRun.subscribers.add(emit);
}

function spawnSubAgentRecord(
  parentRun: LiveRun,
  toolUseId: string | undefined,
  spawn: { agentId: string; prompt: string },
): void {
  const subRunId = randomUUID();
  const { agentId: childAgentId, prompt } = spawn;
  const startTs = Date.now();

  parentRun.childRunIds.push(subRunId);
  if (toolUseId) {
    parentRun.subAgents.set(toolUseId, { subRunId, agentId: childAgentId, prompt, startTs, status: "running" });
  }

  // Insert a placeholder row so the run detail page can be navigated to.
  try {
    db.insertRun({
      id: subRunId,
      agentId: childAgentId,
      agentName: childAgentId,
      instanceId: parentRun.instanceId,
      instanceLabel: parentRun.instanceLabel,
      projectId: parentRun.projectId,
      sessionId: undefined,
      status: "running",
      prompt,
      model: parentRun.model,
      effort: parentRun.effort,
      cwd: parentRun.cwd,
      startedAt: startTs,
      parentRunId: parentRun.id,
    });
  } catch (err) {
    log.warn("subagent.insert_failed", { parentRunId: parentRun.id, err: String(err) });
  }

  broadcast(parentRun, {
    name: "subagent",
    data: {
      type: "subagent",
      parentRunId: parentRun.id,
      subRunId,
      agentId: childAgentId,
      prompt,
      status: "running",
    },
  });

  // Attempt to bridge if the child run is already live (unlikely at this point,
  // but possible if the same process created it). Normally the child registers
  // itself into liveRuns via its own startRun call after we emit the event.
  bridgeChildToParent(parentRun, subRunId);
}

/**
 * Terminal update for a sub-agent driven by the parent stream's `tool_result`.
 * This is the only completion signal for native Task/Agent and Bash children,
 * which never register in `liveRuns` so `bridgeChildToParent` stays dormant.
 */
function finalizeSubAgentFromResult(
  parentRun: LiveRun,
  toolUseId: string,
  block: { content?: unknown; is_error?: boolean },
): void {
  const record = parentRun.subAgents.get(toolUseId);
  if (!record || record.status !== "running") return;

  const output = stringifyToolResult(block.content);
  const lastLine = output ? output.trimEnd().split("\n").pop()?.trim() || undefined : undefined;
  const status: SubAgentStatus = block.is_error ? "error" : "done";
  record.status = status;

  try {
    db.updateRun(record.subRunId, {
      status: status === "done" ? "done" : "error",
      exitCode: status === "done" ? 0 : 1,
      output,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      durMs: Math.max(0, Date.now() - record.startTs),
      endedAt: Date.now(),
    });
  } catch (err) {
    log.warn("subagent.finalize_failed", { subRunId: record.subRunId, err: String(err) });
  }

  broadcast(parentRun, {
    name: "subagent-update",
    data: {
      type: "subagent-update",
      subRunId: record.subRunId,
      status,
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      lastOutputLine: lastLine,
    },
  });
}

function finalizeRun(run: LiveRun, exitCode: number): void {
  if (run.status !== "running") return;

  // Auth failures (expired/unrefreshable OAuth) make the CLI print to stderr and
  // exit non-zero *before* emitting any stream-json result event, so the
  // result-error classification (which needs that event) never runs — the run
  // would surface as a generic error with no way to re-authenticate. Detect it
  // from stderr here and broadcast the auth card, which offers in-app Sign in.
  // Gated on empty output so it can't double up with the result-event path,
  // which always has streamed output by the time a result arrives.
  if (exitCode !== 0 && !run.aborted && run.output.trim() === "") {
    const cls = classifyResultError(run.stderrBuf, run.output);
    if (cls.code === "auth_expired") {
      broadcast(run, { name: "error", data: { runId: run.id, ...cls } });
    }
  }

  run.status = exitCode === 0 ? "done" : "error";
  run.exitCode = exitCode;
  run.finishedAt = Date.now();
  releaseInhibit();

  log.info("run.end", { runId: run.id, exitCode, durMs: run.finishedAt - run.startTs, cost: run.cost });

  const persisted: PersistedRun = {
    id: run.id,
    agentId: run.agentId,
    agentName: run.agentName,
    ts: run.startTs,
    prompt: run.prompt,
    status: run.status,
    exitCode: run.exitCode,
    output: run.output,
    tokensIn: run.tokensIn,
    tokensOut: run.tokensOut,
    cost: run.cost,
    durMs: run.finishedAt - run.startTs,
    model: run.model,
    effort: run.effort,
    cwd: run.cwd,
    projectId: run.projectId,
    instanceId: run.instanceId,
    instanceLabel: run.instanceLabel,
    sessionId: run.sessionId,
    parentRunId: run.parentRunId,
  };

  // Persist best-effort - a DB failure must never swallow the broadcast below.
  try {
    pushRun(persisted);
  } catch (err) {
    log.warn("run.persist_failed", { runId: run.id, err: String(err) });
  }

  try {
    appendHistory({
      key: `${run.agentId}::${run.instanceId ?? "default"}`,
      userContent: run.prompt,
      assistantContent: run.output,
      runId: run.id,
      ts: run.startTs,
    });
  } catch {
    // history write is best-effort - never block finalization
  }

  broadcast(run, {
    name: "done",
    data: {
      runId: run.id,
      exitCode,
      sessionId: run.sessionId,
      durationMs: run.finishedAt - run.startTs,
      tokensIn: run.tokensIn,
      tokensOut: run.tokensOut,
      cost: run.cost,
    },
  });
}
