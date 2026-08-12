/**
 * Cleanup service — surgical resets exposed from the Performance tab.
 *
 * Each function is opt-in and idempotent. Analytics data (runs history,
 * cost, tokens) is preserved except by `everything()`. Every function
 * returns a small summary object so the UI can show "N transcripts / M
 * drafts cleared".
 */

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "./db";
import { USER_ANALYSIS_PATH } from "./user-analysis";
import { AGENTS_DIR, SKILLS_DIR } from "./paths";

export interface CleanupResult {
  cleared: number;
  detail?: Record<string, number>;
}

// ─── Chat transcripts ────────────────────────────────────────────────────────

export function resetAllTranscripts(): CleanupResult {
  const db = getDb();
  const changes = db.prepare("DELETE FROM transcripts").run().changes;
  return { cleared: changes };
}

// ─── Composer drafts ─────────────────────────────────────────────────────────

export function clearComposerDrafts(): CleanupResult {
  const db = getDb();
  const changes = db.prepare("DELETE FROM drafts").run().changes;
  return { cleared: changes };
}

// ─── Orphaned recovered runs ─────────────────────────────────────────────────
// Interrupted pipelines + zombie 'error/-1' runs left by a crash cleanup pass.
// Analytics rows for successful/failed-but-completed runs are preserved.

export function wipeOrphanedRuns(): CleanupResult {
  const db = getDb();
  const orphanRunsChanges = db
    .prepare("DELETE FROM runs WHERE status = 'error' AND exit_code = -1")
    .run().changes;
  const orphanPipelinesChanges = db
    .prepare("DELETE FROM pipelines WHERE interrupted = 1")
    .run().changes;
  return {
    cleared: orphanRunsChanges + orphanPipelinesChanges,
    detail: {
      runs: orphanRunsChanges,
      pipelines: orphanPipelinesChanges,
    },
  };
}

// ─── Agent memory files ──────────────────────────────────────────────────────
// Wipes every `<agent-id>.memory.md` under ~/.claude/agents/. Skips the global
// memory file — that lives elsewhere and is user-authored.

export function resetAgentMemoryFiles(): CleanupResult {
  if (!existsSync(AGENTS_DIR)) return { cleared: 0 };
  let cleared = 0;
  for (const name of readdirSync(AGENTS_DIR)) {
    if (!name.endsWith(".memory.md")) continue;
    if (name === "_global.memory.md") continue;
    const p = join(AGENTS_DIR, name);
    if (!statSync(p).isFile()) continue;
    rmSync(p);
    cleared++;
  }
  return { cleared };
}

// ─── User Analysis file ──────────────────────────────────────────────────────

export function resetUserAnalysis(): CleanupResult {
  if (existsSync(USER_ANALYSIS_PATH)) {
    rmSync(USER_ANALYSIS_PATH);
    return { cleared: 1 };
  }
  return { cleared: 0 };
}

// ─── Skills install cache ────────────────────────────────────────────────────
// Every subdirectory under ~/.claude/agents/_skills/. Skips top-level files.

export function clearSkillInstallCache(): CleanupResult {
  if (!existsSync(SKILLS_DIR)) return { cleared: 0 };
  let cleared = 0;
  for (const name of readdirSync(SKILLS_DIR)) {
    const p = join(SKILLS_DIR, name);
    if (!statSync(p).isDirectory()) continue;
    rmSync(p, { recursive: true, force: true });
    cleared++;
  }
  return { cleared };
}

// ─── UI settings (theme, layout, tab persistence) ────────────────────────────
// The `_migrated` sentinel is preserved so the JSONL→SQLite migration doesn't
// re-run on next boot.

export function resetUiSettings(): CleanupResult {
  const db = getDb();
  const changes = db
    .prepare("DELETE FROM ui_settings WHERE key NOT LIKE '\\_%' ESCAPE '\\'")
    .run().changes;
  return { cleared: changes };
}

// ─── Everything ──────────────────────────────────────────────────────────────
// The bulk nuke — also wipes runs, messages, tool_calls (i.e. analytics
// history). Callers must confirm twice at the UI layer.

export function everything(): CleanupResult {
  const detail: Record<string, number> = {};

  detail.transcripts = resetAllTranscripts().cleared;
  detail.drafts = clearComposerDrafts().cleared;

  const db = getDb();
  db.transaction(() => {
    detail.messages = db.prepare("DELETE FROM messages").run().changes;
    detail.toolCalls = db.prepare("DELETE FROM tool_calls").run().changes;
    detail.runs = db.prepare("DELETE FROM runs").run().changes;
    detail.pipelineSteps = db.prepare("DELETE FROM pipeline_steps").run().changes;
    detail.pipelines = db.prepare("DELETE FROM pipelines").run().changes;
  })();

  detail.agentMemory = resetAgentMemoryFiles().cleared;
  detail.userAnalysis = resetUserAnalysis().cleared;
  detail.skillCache = clearSkillInstallCache().cleared;
  detail.uiSettings = resetUiSettings().cleared;

  const total = Object.values(detail).reduce((a, b) => a + b, 0);
  return { cleared: total, detail };
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

export const CLEANUP_KINDS = [
  "transcripts",
  "drafts",
  "orphaned-runs",
  "agent-memory",
  "user-analysis",
  "skill-cache",
  "ui-settings",
  "everything",
] as const;

export type CleanupKind = (typeof CLEANUP_KINDS)[number];

export function runCleanup(kind: CleanupKind): CleanupResult {
  switch (kind) {
    case "transcripts":
      return resetAllTranscripts();
    case "drafts":
      return clearComposerDrafts();
    case "orphaned-runs":
      return wipeOrphanedRuns();
    case "agent-memory":
      return resetAgentMemoryFiles();
    case "user-analysis":
      return resetUserAnalysis();
    case "skill-cache":
      return clearSkillInstallCache();
    case "ui-settings":
      return resetUiSettings();
    case "everything":
      return everything();
  }
}
