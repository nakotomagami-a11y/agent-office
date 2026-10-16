// The header's "QA loop" toggle: a chat turn that changed files is followed by
// a review loop. The APP starts it, not the agent — a loop the agent has to
// remember to start is the honor system the loop exists to replace.

import * as db from "../db/index";
import { getDb } from "../db/connection";
import * as agents from "../agents/agents";
import * as projects from "../projects/projects";
import { log } from "../infra/log";
import { FILE_EDIT_TOOLS, QA_LOOP_CONFIG, QA_LOOP_REVIEWER } from "../../config/loop";
import { startLoop, type LoopRunner } from "./loop-runner";

/** Goal text is repeated in every round's prompt; a pasted log must not be. */
const MAX_GOAL = 2000;
const MAX_FILES = 30;

/** Sub-agent edits are streamed into the parent run, so this one run is enough. */
function changedFiles(runId: string): string[] {
  const names = FILE_EDIT_TOOLS.map(() => "?").join(",");
  const rows = getDb()
    .prepare(`SELECT input FROM tool_calls WHERE run_id = ? AND name IN (${names})`)
    .all(runId, ...FILE_EDIT_TOOLS) as Array<{ input: string | null }>;
  const files = new Set<string>();
  for (const r of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(r.input ?? "");
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const o = parsed as Record<string, unknown>;
    const path = o.file_path ?? o.notebook_path;
    files.add(typeof path === "string" ? path : "(unknown file)");
  }
  return [...files];
}

/** A prompting reviewer would wait on approvals no chat shows: its runs belong
 *  to no conversation. Refuse up front rather than pay for a stalled round. */
function reviewerProblem(): string | null {
  const reviewer = agents.readAgent(QA_LOOP_REVIEWER);
  if (!reviewer) return "reviewer_missing";
  const mode = reviewer.info.permissionMode;
  if (mode && mode !== "bypassPermissions") return "reviewer_needs_prompts";
  return null;
}

/** The loop's id when one was started, else null. */
export async function maybeStartQaLoop(
  runId: string,
  ok: boolean,
  runner: LoopRunner,
  now: number,
): Promise<string | null> {
  if (!ok) return null;
  const run = db.getRun(runId);
  // A loop's own reviewer rounds carry no conversationId; its fix rounds are `system`.
  if (!run?.conversationId || !run.projectId || !run.instanceId) return null;
  // System turns (a fix round, a background shell's wake) are not the user
  // asking for work, and would chain loops with nobody present.
  if (run.origin !== "user") return null;
  // Runs after the conversation's own listener (services/index.ts import order),
  // which has already started any queued message: the work is not finished yet.
  const conv = db.getConversation(run.conversationId);
  if (conv?.status !== "idle" || db.listQueue(run.conversationId).length > 0) return null;
  // One loop at a time per chat: a second would review the first one's fixes mid-flight.
  if (db.listLoopsForConversation(run.conversationId).some((l) => !l.state.binding)) return null;
  const files = changedFiles(runId);
  if (files.length === 0) return null;
  const instance = projects.findInstance(projects.readProject(run.projectId), run.instanceId);
  if (!instance?.qaLoopEnabled) return null;
  const problem = reviewerProblem();
  if (problem) {
    log.warn("qa_loop.not_started", { runId, reason: problem, reviewer: QA_LOOP_REVIEWER });
    return null;
  }

  const listed = files.slice(0, MAX_FILES).map((f) => `- ${f}`).join("\n");
  const id = await startLoop(
    {
      agentId: run.agentId,
      reviewerAgentId: QA_LOOP_REVIEWER,
      instanceId: run.instanceId,
      projectId: run.projectId,
      conversationId: run.conversationId,
      cwd: run.cwd ?? null,
      goal: `${run.prompt.slice(0, MAX_GOAL)}\n\nFiles that turn edited:\n${listed}`,
      config: { ...QA_LOOP_CONFIG },
      startAt: "reviewing",
    },
    runner,
    now,
  );
  log.info("qa_loop.started", { loopId: id, runId });
  return id;
}
