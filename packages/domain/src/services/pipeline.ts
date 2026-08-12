// Multi-agent pipeline orchestration.
//
// Supports sequential steps (each receives {{output}} from the previous) and
// parallel groups ({ kind: "parallel", steps: [...] }) whose outputs are joined
// and fed to the next sequential step.
//
// Every status transition is mirrored to SQLite so pipelines survive server
// restarts. Pipelines interrupted mid-run surface as `interrupted: true` so
// the UI can show a recovery banner identical to the run-recovery UX.

import { randomUUID } from "node:crypto";
import type {
  CreatePipelineRequest,
  ParallelPipelineStep,
  PipelineRun,
  PipelineRunStep,
  PipelineStep,
} from "../types/index";
import * as agents from "./agents";
import * as db from "./db";
import * as projects from "./projects";
import * as summon from "./summon";
import * as runs from "./runs";
import * as store from "./store";
import { log } from "./log";

declare global {
  // eslint-disable-next-line no-var
  var __agentOfficePipelines: Map<string, PipelineRun> | undefined;
}

const pipelines: Map<string, PipelineRun> =
  globalThis.__agentOfficePipelines ??
  (globalThis.__agentOfficePipelines = new Map());

const STEP_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes per step
const PIPELINE_TIMEOUT_MS = 4 * STEP_TIMEOUT_MS; // 4 hours overall cap
const PIPELINE_CLEANUP_DELAY_MS = 30_000; // keep finished pipelines in memory briefly for in-flight polls

export function getPipeline(id: string): PipelineRun | undefined {
  return pipelines.get(id) ?? db.getPipelineFromDb(id) ?? undefined;
}

export function listPipelines(): PipelineRun[] {
  return Array.from(pipelines.values());
}

export function getInterruptedPipelines(): PipelineRun[] {
  return db.listInterruptedPipelines();
}

function scheduleCleanup(id: string): void {
  setTimeout(() => pipelines.delete(id), PIPELINE_CLEANUP_DELAY_MS).unref();
}

function isParallel(step: PipelineStep | ParallelPipelineStep): step is ParallelPipelineStep {
  return (step as ParallelPipelineStep).kind === "parallel";
}

/**
 * Expand CreatePipelineRequest steps into a flat PipelineRunStep array.
 * Parallel sub-steps get consecutive indices and share a `parallelGroup`.
 */
function expandSteps(reqSteps: CreatePipelineRequest["steps"]): PipelineRunStep[] {
  const out: PipelineRunStep[] = [];
  let flatIdx = 0;
  let groupIdx = 0;
  for (const item of reqSteps) {
    if (isParallel(item)) {
      for (const leaf of item.steps) {
        out.push({
          stepIndex: flatIdx++,
          agentId: leaf.agentId,
          runId: "",
          status: "pending",
          parallelGroup: groupIdx,
        });
      }
      groupIdx++;
    } else {
      out.push({
        stepIndex: flatIdx++,
        agentId: item.agentId,
        runId: "",
        status: "pending",
      });
    }
  }
  return out;
}

function waitForRun(runId: string): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    // Fast path: run already in a terminal state (live or persisted).
    const live = runs.getLiveRun(runId);
    if (live && live.status !== "running") {
      resolve({ output: live.output, exitCode: live.exitCode ?? (live.status === "done" ? 0 : 1) });
      return;
    }
    if (!live) {
      const persisted = store.getRun(runId);
      if (persisted) {
        resolve({
          output: persisted.output,
          exitCode: persisted.exitCode ?? (persisted.status === "done" ? 0 : 1),
        });
        return;
      }
    }

    // Slow path: subscribe to run events and resolve when the run finishes.
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      runs.detachEmit(runId, emit);
      reject(new Error(`step timed out after ${STEP_TIMEOUT_MS / 1000}s (runId=${runId})`));
    }, STEP_TIMEOUT_MS);

    const emit: runs.SseEmit = (event) => {
      if (settled) return;
      if (event.name === "done") {
        settled = true;
        clearTimeout(timer);
        runs.detachEmit(runId, emit);
        const liveRun = runs.getLiveRun(runId);
        const exitCode = event.data.exitCode;
        const output = liveRun?.output ?? store.getRun(runId)?.output ?? "";
        resolve({ output, exitCode });
      } else if (event.name === "error") {
        // error events are informational (e.g. rate-limit warnings); the run
        // continues. Only the "done" event with a non-zero exitCode is terminal.
      }
    };

    // attachEmit replays existing events and immediately fires "done" if the
    // run already finished — so the fast path above is a belt-and-suspenders
    // guard, not the only terminal-state handler.
    const attached = runs.attachEmit(runId, emit);
    if (!attached) {
      // Run is not in liveRuns at all and wasn't in store — treat as missing.
      settled = true;
      clearTimeout(timer);
      reject(new Error(`run not found (runId=${runId})`));
    }
  });
}

function mirrorStep(pipeline: PipelineRun, step: PipelineRunStep): void {
  db.upsertPipelineStep({
    pipelineId: pipeline.id,
    stepIndex: step.stepIndex,
    parallelGroup: step.parallelGroup,
    agentId: step.agentId,
    runId: step.runId || undefined,
    status: step.status,
    output: step.output,
    exitCode: step.exitCode,
  });
}

function mirrorPipelineStatus(pipeline: PipelineRun, endedAt?: number): void {
  db.updatePipelineStatus(pipeline.id, pipeline.status, endedAt);
}

/** Run a single leaf step and return its output. Updates the PipelineRunStep in-place. */
async function runLeafStep(
  pipeline: PipelineRun,
  pipelineStep: PipelineRunStep,
  leafStep: PipelineStep,
  prompt: string,
  req: CreatePipelineRequest,
): Promise<{ output: string; exitCode: number }> {
  const project = req.projectId ? projects.readProject(req.projectId) : null;
  const agentResult = agents.readAgent(leafStep.agentId);
  if (!agentResult) {
    throw new Error(`agent '${leafStep.agentId}' not found at stepIndex ${pipelineStep.stepIndex}`);
  }

  const instance = projects.findInstance(project, leafStep.instanceId);
  const appendedSystemPrompt = agents.buildAppendedPrompt(leafStep.agentId, project);

  const built = summon.buildClaudeArgs({
    request: {
      agentId: leafStep.agentId,
      prompt,
      model: leafStep.model,
      effort: leafStep.effort,
      cwd: req.cwd,
      projectId: req.projectId,
      instanceId: leafStep.instanceId,
    },
    agent: agentResult.info,
    instance,
    appendedSystemPrompt,
  });

  const instanceLabel = instance?.label ?? (instance ? agentResult.info.name : undefined);

  pipelineStep.status = "running";
  mirrorStep(pipeline, pipelineStep);

  const { runId } = runs.startRun({
    agentId: leafStep.agentId,
    agentName: instanceLabel ?? agentResult.info.name,
    prompt,
    model: built.model,
    effort: built.effort,
    cwd: req.cwd,
    projectId: req.projectId,
    instanceId: instance?.instanceId,
    instanceLabel,
    args: built.args,
  });
  pipelineStep.runId = runId;
  mirrorStep(pipeline, pipelineStep);

  return waitForRun(runId);
}

async function runOrchestration(pipeline: PipelineRun, req: CreatePipelineRequest): Promise<void> {
  let previousOutput = "";
  let flatIdx = 0;
  const startedAt = Date.now();

  for (const item of req.steps) {
    if (Date.now() - startedAt > PIPELINE_TIMEOUT_MS) {
      log.warn("pipeline.timeout", { pipelineId: pipeline.id });
      for (let j = flatIdx; j < pipeline.steps.length; j++) {
        pipeline.steps[j]!.status = "error";
        mirrorStep(pipeline, pipeline.steps[j]!);
      }
      pipeline.status = "error";
      mirrorPipelineStatus(pipeline, Date.now());
      scheduleCleanup(pipeline.id);
      throw new Error("Pipeline exceeded maximum allowed duration");
    }

    if (isParallel(item)) {
      // Fan-out: run all sub-steps concurrently
      const group = item.steps;
      const groupSteps = pipeline.steps.slice(flatIdx, flatIdx + group.length);
      flatIdx += group.length;

      log.info("pipeline.parallel.start", { pipelineId: pipeline.id, count: group.length });

      const results = await Promise.allSettled(
        group.map((leafStep, i) => {
          const prompt = leafStep.promptTemplate.replace(/\{\{output\}\}/g, previousOutput);
          return runLeafStep(pipeline, groupSteps[i]!, leafStep, prompt, req);
        }),
      );

      // Collect outputs and propagate errors
      const outputs: string[] = [];
      let groupFailed = false;
      for (let i = 0; i < results.length; i++) {
        const r = results[i]!;
        const pStep = groupSteps[i]!;
        if (r.status === "fulfilled") {
          pStep.output = r.value.output;
          pStep.exitCode = r.value.exitCode;
          pStep.status = r.value.exitCode === 0 ? "done" : "error";
          if (r.value.exitCode !== 0) groupFailed = true;
          else outputs.push(r.value.output);
        } else {
          pStep.status = "error";
          pStep.exitCode = 1;
          groupFailed = true;
          log.warn("pipeline.parallel.step_error", { pipelineId: pipeline.id, stepIndex: pStep.stepIndex, error: String(r.reason) });
        }
        mirrorStep(pipeline, pStep);
      }

      if (groupFailed) {
        // Mark all remaining pending steps as error
        for (let j = flatIdx; j < pipeline.steps.length; j++) {
          pipeline.steps[j]!.status = "error";
          mirrorStep(pipeline, pipeline.steps[j]!);
        }
        pipeline.status = "error";
        mirrorPipelineStatus(pipeline, Date.now());
        scheduleCleanup(pipeline.id);
        return;
      }

      // Fan-in: join outputs for the next step
      previousOutput = outputs.join("\n\n---\n\n");
      log.info("pipeline.parallel.done", { pipelineId: pipeline.id });

    } else {
      // Sequential step
      const pipelineStep = pipeline.steps[flatIdx]!;
      flatIdx++;

      const prompt = item.promptTemplate.replace(/\{\{output\}\}/g, previousOutput);

      log.info("pipeline.step.start", { pipelineId: pipeline.id, stepIndex: pipelineStep.stepIndex, agentId: item.agentId });

      let result: { output: string; exitCode: number };
      try {
        result = await runLeafStep(pipeline, pipelineStep, item, prompt, req);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn("pipeline.step.error", { pipelineId: pipeline.id, stepIndex: pipelineStep.stepIndex, error: message });
        pipelineStep.status = "error";
        pipelineStep.exitCode = 1;
        mirrorStep(pipeline, pipelineStep);
        for (let j = flatIdx; j < pipeline.steps.length; j++) {
          pipeline.steps[j]!.status = "error";
          mirrorStep(pipeline, pipeline.steps[j]!);
        }
        pipeline.status = "error";
        mirrorPipelineStatus(pipeline, Date.now());
        scheduleCleanup(pipeline.id);
        return;
      }

      pipelineStep.output = result.output;
      pipelineStep.exitCode = result.exitCode;

      if (result.exitCode !== 0) {
        log.warn("pipeline.step.nonzero_exit", { pipelineId: pipeline.id, stepIndex: pipelineStep.stepIndex, exitCode: result.exitCode });
        pipelineStep.status = "error";
        mirrorStep(pipeline, pipelineStep);
        for (let j = flatIdx; j < pipeline.steps.length; j++) {
          pipeline.steps[j]!.status = "error";
          mirrorStep(pipeline, pipeline.steps[j]!);
        }
        pipeline.status = "error";
        mirrorPipelineStatus(pipeline, Date.now());
        scheduleCleanup(pipeline.id);
        return;
      }

      pipelineStep.status = "done";
      mirrorStep(pipeline, pipelineStep);
      previousOutput = result.output;
      log.info("pipeline.step.done", { pipelineId: pipeline.id, stepIndex: pipelineStep.stepIndex });
    }
  }

  pipeline.status = "done";
  mirrorPipelineStatus(pipeline, Date.now());
  scheduleCleanup(pipeline.id);
  log.info("pipeline.done", { pipelineId: pipeline.id });
}

/**
 * Create a pipeline and begin asynchronous orchestration immediately.
 * Returns the initial `PipelineRun` with all steps in "pending" state.
 */
export function createPipeline(req: CreatePipelineRequest): PipelineRun {
  const id = randomUUID();
  const steps = expandSteps(req.steps);

  const pipeline: PipelineRun = {
    id,
    projectId: req.projectId,
    steps,
    status: "running",
    createdAt: Date.now(),
  };

  pipelines.set(id, pipeline);

  // Persist initial state
  db.insertPipeline({ id, projectId: req.projectId, createdAt: pipeline.createdAt });
  for (const step of steps) {
    db.upsertPipelineStep({
      pipelineId: id,
      stepIndex: step.stepIndex,
      parallelGroup: step.parallelGroup,
      agentId: step.agentId,
      status: "pending",
    });
  }

  log.info("pipeline.created", { pipelineId: id, stepCount: steps.length });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Pipeline exceeded maximum runtime")),
      PIPELINE_TIMEOUT_MS,
    ).unref(),
  );

  void Promise.race([runOrchestration(pipeline, req), timeoutPromise]).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("pipeline.orchestration_uncaught", { pipelineId: id, error: message });
    if (pipeline.status !== "done" && pipeline.status !== "error") {
      pipeline.status = "error";
    }
    for (const step of pipeline.steps) {
      if (step.status === "pending" || step.status === "running") {
        step.status = "error";
        if (step.runId) runs.abortRun(step.runId);
        db.upsertPipelineStep({ pipelineId: id, stepIndex: step.stepIndex, agentId: step.agentId, status: "error" });
      }
    }
    db.updatePipelineStatus(id, "error", Date.now());
    scheduleCleanup(id);
  });

  return pipeline;
}
