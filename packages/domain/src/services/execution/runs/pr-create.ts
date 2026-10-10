// Remembers which seat opened which pull request, so review feedback can reach that
// seat's chat: an agent's `gh pr create` prints the new PR's URL on a line of its own.
// Links are only ever trusted inside the run's own project (review/pulls.ts resolveLink).
import type { LiveRun } from "./types";
import { log } from "../../infra/log";
import * as db from "../../db";

/** `gh pr create` as a command of its own, not text inside another command (`echo gh pr create`). */
const PR_CREATE = /(?:^|&&|\|\||;|\n)\s*gh\s+pr\s+create\b/;
/** gh prints the URL alone on its line; a URL inside other output (tests, logs) is not it. */
const PR_URL_LINE = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)\s*$/m;

export function isPrCreateInput(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  const command = (input as { command?: unknown }).command;
  return typeof command === "string" && PR_CREATE.test(command);
}

/** The first URL-only line: gh prints it as soon as the PR exists, before whatever runs next. */
export function createdPr(output: string): { repo: string; number: number } | null {
  const m = PR_URL_LINE.exec(output);
  return m?.[1] && m[2] ? { repo: m[1].toLowerCase(), number: Number(m[2]) } : null;
}

/** At tool_use: remember a Bash call that opens a PR. */
export function notePrCreate(run: LiveRun, toolName: string, toolUseId: string | undefined, input: unknown): void {
  if (toolName === "Bash" && toolUseId && isPrCreateInput(input)) run.pendingPrCreate.add(toolUseId);
}

/** At tool_result: a remembered call that succeeded links its PR to this run's seat. */
export function settlePrCreate(run: LiveRun, toolUseId: string, isError: boolean, output: () => string): void {
  if (run.pendingPrCreate.delete(toolUseId) && !isError) recordCreatedPr(run, output());
}

export function recordCreatedPr(run: LiveRun, output: string): void {
  const pr = createdPr(output);
  if (!pr || !run.projectId) return;
  const instanceId = run.instanceId ?? "default";
  db.setPrLink({ ...pr, projectId: run.projectId, agentId: run.agentId, instanceId, source: "recorded" });
  log.info("review.pr_linked", { ...pr, agentId: run.agentId, instanceId });
}
