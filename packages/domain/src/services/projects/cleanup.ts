/**
 * Cleanup service — surgical resets exposed from the Performance tab.
 *
 * Each function is opt-in and idempotent. Analytics data (runs history,
 * cost, tokens) is preserved except by `everything()`. Every function
 * returns a small summary object so the UI can show "N transcripts / M
 * drafts cleared".
 */

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import type { CleanupKind } from "../../config/cleanup";
import { join } from "node:path";
import { getDb } from "../db";
import { USER_ANALYSIS_PATH } from "../analytics/user-analysis";
import { AGENTS_DIR, SKILLS_DIR } from "../infra/paths";

/** An unreadable entry is "not this kind", not fatal to the whole sweep. */
export function isKind(path: string, kind: "file" | "dir"): boolean {
  try {
    const st = statSync(path);
    return kind === "file" ? st.isFile() : st.isDirectory();
  } catch {
    return false;
  }
}

export interface CleanupResult {
  cleared: number;
  detail?: Record<string, number>;
}

/** FK children of `runs`: no ON DELETE CASCADE, so a run deleted before them
 *  throws. cleanup.test.ts asserts this still matches the schema. */
export const RUN_CHILD_TABLES = ["messages", "tool_calls", "background_shells"] as const;

/** Runs matching `where`, plus their children, in FK-safe order. */
function deleteRunsWhere(where: string): number {
  const db = getDb();
  const ids = db.prepare(`SELECT id FROM runs WHERE ${where}`).all() as Array<{ id: string }>;
  if (ids.length === 0) return 0;
  const list = ids.map(() => "?").join(",");
  const params = ids.map((r) => r.id);
  for (const t of RUN_CHILD_TABLES) {
    db.prepare(`DELETE FROM ${t} WHERE run_id IN (${list})`).run(...params);
  }
  return db.prepare(`DELETE FROM runs WHERE id IN (${list})`).run(...params).changes;
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
  const { orphanRunsChanges, orphanPipelinesChanges } = db.transaction(() => ({
    orphanRunsChanges: deleteRunsWhere("status = 'error' AND exit_code = -1"),
    orphanPipelinesChanges: db
      .prepare("DELETE FROM pipelines WHERE interrupted = 1")
      .run().changes,
  }))();
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
    if (!isKind(p, "file")) continue;
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
    if (!isKind(p, "dir")) continue;
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
// The bulk nuke — also wipes analytics history. Confirmed twice at the UI.

export function everything(): CleanupResult {
  const detail: Record<string, number> = {};
  const db = getDb();

  // EVERY db write in one transaction, or a rollback leaves a partial wipe.
  db.transaction(() => {
    detail.transcripts = resetAllTranscripts().cleared;
    detail.drafts = clearComposerDrafts().cleared;
    detail.uiSettings = resetUiSettings().cleared;
    for (const t of RUN_CHILD_TABLES) {
      detail[t] = db.prepare(`DELETE FROM ${t}`).run().changes;
    }
    detail.runs = db.prepare("DELETE FROM runs").run().changes;
    detail.pipelineSteps = db.prepare("DELETE FROM pipeline_steps").run().changes;
    detail.pipelines = db.prepare("DELETE FROM pipelines").run().changes;
  })();

  // Filesystem last: it cannot be rolled back if the db half fails.
  detail.agentMemory = resetAgentMemoryFiles().cleared;
  detail.userAnalysis = resetUserAnalysis().cleared;
  detail.skillCache = clearSkillInstallCache().cleared;

  const total = Object.values(detail).reduce((a, b) => a + b, 0);
  return { cleared: total, detail };
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

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
