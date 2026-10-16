// The header's "QA loop" toggle: a chat turn that changed files is followed by
// a review loop. The APP starts it, not the agent — a loop the agent has to
// remember to start is the honor system the loop exists to replace.

import * as db from "../db/index";
import { getDb } from "../db/connection";
import * as projects from "../projects/projects";
import { log } from "../infra/log";
import { FILE_EDIT_TOOLS, QA_LOOP_CONFIG, QA_LOOP_REVIEWER } from "../../config/loop";
import { startLoop, type LoopRunner } from "./loop-runner";

/** Goal text is repeated in every round's prompt; a pasted log must not be. */
const MAX_GOAL = 2000;

/** Sub-agent runs count: "implement X" is often delegated. */
function changedFiles(runId: string): boolean {
  const names = FILE_EDIT_TOOLS.map(() => "?").join(",");
  return !!getDb()
    .prepare(
      `SELECT 1 FROM tool_calls WHERE name IN (${names})
         AND run_id IN (SELECT id FROM runs WHERE id = ? OR parent_run_id = ?) LIMIT 1`,
    )
    .get(...FILE_EDIT_TOOLS, runId, runId);
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
  // A loop's own rounds carry no conversationId, so they never re-trigger this.
  if (!run?.conversationId || run.parentRunId || !run.projectId || !run.instanceId) return null;
  const instance = projects.findInstance(projects.readProject(run.projectId), run.instanceId);
  if (!instance?.qaLoopEnabled) return null;
  // One loop at a time per chat: a second would review the first one's fixes mid-flight.
  if (db.listLoopsForConversation(run.conversationId).some((l) => !l.state.binding)) return null;
  if (!changedFiles(runId)) return null;

  const id = await startLoop(
    {
      agentId: run.agentId,
      reviewerAgentId: QA_LOOP_REVIEWER,
      instanceId: run.instanceId,
      projectId: run.projectId,
      conversationId: run.conversationId,
      cwd: run.cwd ?? null,
      goal: run.prompt.slice(0, MAX_GOAL),
      config: { ...QA_LOOP_CONFIG },
      startAt: "reviewing",
    },
    runner,
    now,
  );
  log.info("qa_loop.started", { loopId: id, runId });
  return id;
}
