// Build the `claude -p` arg list for a summon, applying instance + agent defaults.

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentInstance, ApiAgent, SummonRequest } from "../../types/index";
import { APP_STATE_DIR } from "../infra/paths";

export interface BuiltCommand {
  args: string[];
  model: string;
  effort: string;
  permissionMode?: string;
  systemPromptFile?: string;
}

// Linux execve() rejects any single argv string over MAX_ARG_STRLEN (128 KiB,
// enforced kernel-side regardless of ARG_MAX/ulimit) with ENAMETOOLONG, which
// surfaces to Node as `spawn E2BIG` before the child process even starts. An
// agent with a heavy skill loadout (e.g. a dozen+ multi-KB SKILL.md bodies
// concatenated by buildAppendedPrompt) blows past that easily. Passing the
// system prompt as a file via `--append-system-prompt-file` sidesteps the
// limit entirely — write once, hand the CLI a path instead of the payload.
const TMP_PROMPTS_DIR = join(APP_STATE_DIR, "tmp-prompts");
const TMP_PROMPT_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h — generous vs. realistic run duration

/** Best-effort sweep of stale prompt files. Never throws — cleanup is opportunistic. */
function pruneStaleSystemPromptFiles(): void {
  try {
    if (!existsSync(TMP_PROMPTS_DIR)) return;
    const now = Date.now();
    for (const f of readdirSync(TMP_PROMPTS_DIR)) {
      const p = join(TMP_PROMPTS_DIR, f);
      try {
        if (now - statSync(p).mtimeMs > TMP_PROMPT_MAX_AGE_MS) unlinkSync(p);
      } catch {
        /* file may have been removed concurrently — ignore */
      }
    }
  } catch {
    /* non-fatal: worst case tmp-prompts/ grows until the next successful sweep */
  }
}

/** Write `content` to a fresh file under `tmp-prompts/` and return its path. */
function writeSystemPromptFile(content: string): string {
  if (!existsSync(TMP_PROMPTS_DIR)) mkdirSync(TMP_PROMPTS_DIR, { recursive: true });
  pruneStaleSystemPromptFiles();
  const file = join(TMP_PROMPTS_DIR, `${randomUUID()}.md`);
  writeFileSync(file, content, "utf8");
  return file;
}

export function buildClaudeArgs(opts: {
  request: SummonRequest;
  agent: ApiAgent;
  instance: AgentInstance | null;
  appendedSystemPrompt: string;
  priorContext?: string;
}): BuiltCommand {
  const { request, agent, instance, appendedSystemPrompt, priorContext } = opts;

  const args = [
    "-p",
    "--agent",
    request.agentId,
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
  ];

  const model = request.model ?? instance?.model ?? agent.defaultModel ?? "default";
  const effort = request.effort ?? instance?.effort ?? agent.defaultEffort ?? "default";
  const permissionMode = instance?.permissionMode ?? agent.permissionMode;

  if (model && model !== "default") args.push("--model", model);
  if (effort && effort !== "default") args.push("--effort", effort);
  if (request.maxBudgetUsd && request.maxBudgetUsd > 0) {
    args.push("--max-budget-usd", String(request.maxBudgetUsd));
  }
  if (permissionMode) args.push("--permission-mode", permissionMode);
  for (const dir of agent.addDirs ?? []) {
    args.push("--add-dir", dir.replace(/^~/, homedir()));
  }
  let systemPromptFile: string | undefined;
  if (appendedSystemPrompt) {
    systemPromptFile = writeSystemPromptFile(appendedSystemPrompt);
    args.push("--append-system-prompt-file", systemPromptFile);
  }
  if (request.resumeSessionId) args.push("--resume", request.resumeSessionId);

  args.push(priorContext ? priorContext + request.prompt : request.prompt);

  return { args, model, effort, permissionMode, systemPromptFile };
}
