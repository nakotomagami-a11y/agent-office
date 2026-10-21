/**
 * Cleanup service — surgical resets exposed from the Performance tab.
 *
 * Each function is opt-in and idempotent. Analytics data (runs history,
 * cost, tokens) is preserved except by `everything()`. Every function
 * returns a small summary object so the UI can show "N transcripts / M
 * drafts cleared".
 */

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import type { CleanupKind } from "../../config/cleanup";
import { join } from "node:path";
import { getDb, deleteRunsWhere, isPidAlive } from "../db";
import { STALLED_START_MS } from "../execution/conversation";
import { emitAppEvent } from "../infra/events";
import { writeFileAtomic } from "../infra/fs-atomic";
import { AGENTS_DIR, SKILLS_DIR } from "../infra/paths";
import { liveRuns } from "../execution/runs/registry";

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

/** FK refs INTO `runs`, checked against the schema in cleanup.test.ts. Keyed
 *  on the TABLE: a `run_id` name filter hid the `parent_run_id` self-FK. */
export const RUN_FK_REFS = [
  "messages.run_id",
  "tool_calls.run_id",
  "background_shells.run_id",
  "runs.parent_run_id",
] as const;

const RUN_CHILD_TABLES = ["messages", "tool_calls", "background_shells"] as const;

export const PIPELINE_CHILD_TABLES = ["pipeline_steps"] as const;

function deletePipelinesWhere(where: string): number {
  const db = getDb();
  const ids = `SELECT id FROM pipelines WHERE ${where}`;
  for (const t of PIPELINE_CHILD_TABLES) {
    db.prepare(`DELETE FROM ${t} WHERE pipeline_id IN (${ids})`).run();
  }
  return db.prepare(`DELETE FROM pipelines WHERE ${where}`).run().changes;
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
// Analytics rows for successful/failed-but-completed runs are preserved. A chat
// turn (or a sub-agent inside one) is the transcript itself, so it is never an orphan.

const ORPHANED_RUN = `status = 'error' AND exit_code = -1 AND conversation_id IS NULL
  AND (parent_run_id IS NULL OR parent_run_id NOT IN (SELECT id FROM runs WHERE conversation_id IS NOT NULL))`;

export function wipeOrphanedRuns(): CleanupResult {
  const db = getDb();
  const { orphanRunsChanges, orphanPipelinesChanges } = db.transaction(() => ({
    orphanRunsChanges: deleteRunsWhere(ORPHANED_RUN),
    orphanPipelinesChanges: deletePipelinesWhere("interrupted = 1"),
  }))();
  if (orphanRunsChanges > 0) {
    emitAppEvent("conversations:changed");
    emitAppEvent("loops:changed");
  }
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

export function resetAgentMemoryFiles(dir: string = AGENTS_DIR): CleanupResult {
  if (!existsSync(dir)) return { cleared: 0 };
  let cleared = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".memory.md")) continue;
    if (name === "_global.memory.md") continue;
    const p = join(dir, name);
    if (!isKind(p, "file")) continue;
    rmSync(p);
    cleared++;
  }
  return { cleared };
}

// ─── Downloaded and bundled skills ───────────────────────────────────────────
// Only what can come back: registry installs (they carry `.source.json`) and
// bundled skills still byte-identical to the bundle. This once deleted every
// skill folder, the user's own forged and imported skills included.

function readSeeded(file: string): string[] | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(raw) ? raw.filter((n): n is string => typeof n === "string") : null;
  } catch {
    return null;
  }
}

function sameTree(a: string, b: string): boolean {
  try {
    const sa = statSync(a);
    const sb = statSync(b);
    if (sa.isDirectory() !== sb.isDirectory()) return false;
    if (!sa.isDirectory()) return sa.size === sb.size && readFileSync(a).equals(readFileSync(b));
    const na = readdirSync(a).sort();
    const nb = readdirSync(b).sort();
    return na.length === nb.length && na.every((n, i) => n === nb[i] && sameTree(join(a, n), join(b, n)));
  } catch {
    return false;
  }
}

/** `bundledDir` is the shipped `starter-data/skills`; without it no bundled skill is touched. */
export function clearSkillInstallCache(dir: string = SKILLS_DIR, bundledDir: string | null = null): CleanupResult {
  if (!existsSync(dir)) return { cleared: 0 };
  const markerFile = join(dir, "_seeded.json");
  const seeded = readSeeded(markerFile);
  const reseed = new Set<string>();
  let cleared = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name.startsWith("_") || !isKind(p, "dir")) continue;
    const fromRegistry = isKind(join(p, ".source.json"), "file");
    const asBundled = !fromRegistry && !!bundledDir && !!seeded?.includes(name) && sameTree(p, join(bundledDir, name));
    if (!fromRegistry && !asBundled) continue;
    rmSync(p, { recursive: true, force: true });
    if (asBundled) reseed.add(name);
    cleared++;
  }
  // Boot (server boot.ts) re-offers what is missing from the marker: just these,
  // not a bundled skill the user uninstalled on purpose.
  if (seeded && reseed.size > 0) writeFileAtomic(markerFile, JSON.stringify(seeded.filter((n) => !reseed.has(n))));
  return { cleared };
}

// ─── UI settings (theme, layout, tab persistence) ────────────────────────────
// The `_migrated` sentinel is preserved so the JSONL→SQLite migration doesn't
// re-run on next boot. `office-*` (maps, decorations) is work and
// `claude-limits` (the spend cap) is configuration: neither is a preference.

export function resetUiSettings(): CleanupResult {
  const db = getDb();
  const changes = db
    .prepare("DELETE FROM ui_settings WHERE key NOT LIKE '\\_%' ESCAPE '\\' AND key NOT LIKE 'office-%' AND key != 'claude-limits'")
    .run().changes;
  return { cleared: changes };
}

// ─── Everything ──────────────────────────────────────────────────────────────
// The bulk nuke — also wipes analytics history. Confirmed twice at the UI.

export interface CleanupOptions {
  /** The shipped `starter-data/skills`, so bundled skills can be told from the user's. */
  bundledSkillsDir?: string | null;
}

/** Refused rather than wiping around them: a live run keeps writing its rows and expects its
 *  chat and loop to hear it finish. `count` is runs plus chats and loops still starting one. */
export class RunsLiveError extends Error {
  readonly code = "runs_live";
  constructor(readonly count: number) {
    super(`runs_live: ${count}`);
    this.name = "RunsLiveError";
  }
}

/** A `running` row counts only while its server lives, and for this server only while it holds
 *  the run: a ghost row (crash, killed run) would otherwise refuse every erase until a restart. */
function liveWork(): number {
  const db = getDb();
  const ids = new Set<string>();
  for (const [id, run] of liveRuns) if (run.status === "running") ids.add(id);
  const rows = db.prepare("SELECT id, owner_pid FROM runs WHERE status = 'running'").all() as Array<{ id: string; owner_pid: number | null }>;
  for (const r of rows) {
    if (r.owner_pid === process.pid ? liveRuns.has(r.id) : isPidAlive(r.owner_pid)) ids.add(r.id);
  }
  // A chat or loop between "starting" and its run's row: wiping it there loses the run's finish.
  const since = Date.now() - STALLED_START_MS;
  const starting = db.prepare(
    `SELECT (SELECT COUNT(*) FROM conversations WHERE status = 'running' AND active_run_id IS NULL AND updated_at >= ?)
          + (SELECT COUNT(*) FROM loops WHERE phase IN ('authoring', 'reviewing', 'fixing') AND active_run_id IS NULL AND updated_at >= ?) AS n`,
  ).get(since, since) as { n: number };
  return ids.size + starting.n;
}

export function everything(opts: CleanupOptions = {}): CleanupResult {
  const detail: Record<string, number> = {};
  const db = getDb();

  // EVERY db write in one transaction, or a rollback leaves a partial wipe.
  // IMMEDIATE: the write lock is taken before the check, so no run can start between the two.
  db.transaction(() => {
    const live = liveWork();
    if (live > 0) throw new RunsLiveError(live);
    detail.transcripts = resetAllTranscripts().cleared;
    detail.drafts = clearComposerDrafts().cleared;
    detail.uiSettings = resetUiSettings().cleared;
    // `active_run_id` has no FK, so deleting runs beneath a conversation or
    // loop does not throw — it WEDGES it: the reconcilers read a missing run
    // as "just spawned" and return early forever.
    detail.scheduled_jobs = db.prepare("DELETE FROM scheduled_jobs").run().changes;
    detail.queued_messages = db.prepare("DELETE FROM queued_messages").run().changes;
    detail.loops = db.prepare("DELETE FROM loops").run().changes;
    detail.conversations = db.prepare("DELETE FROM conversations").run().changes;
    for (const t of RUN_CHILD_TABLES) {
      detail[t] = db.prepare(`DELETE FROM ${t}`).run().changes;
    }
    detail.runs = db.prepare("DELETE FROM runs").run().changes;
    detail.pipeline_steps = db.prepare("DELETE FROM pipeline_steps").run().changes;
    detail.pipelines = db.prepare("DELETE FROM pipelines").run().changes;
  }).immediate();

  // Filesystem last: it cannot be rolled back if the db half fails.
  detail.agentMemory = resetAgentMemoryFiles().cleared;
  detail.skillCache = clearSkillInstallCache(SKILLS_DIR, opts.bundledSkillsDir ?? null).cleared;

  const total = Object.values(detail).reduce((a, b) => a + b, 0);
  return { cleared: total, detail };
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

export function runCleanup(kind: CleanupKind, opts: CleanupOptions = {}): CleanupResult {
  switch (kind) {
    case "transcripts":
      return resetAllTranscripts();
    case "drafts":
      return clearComposerDrafts();
    case "orphaned-runs":
      return wipeOrphanedRuns();
    case "agent-memory":
      return resetAgentMemoryFiles();
    case "skill-cache":
      return clearSkillInstallCache(SKILLS_DIR, opts.bundledSkillsDir ?? null);
    case "ui-settings":
      return resetUiSettings();
    case "everything":
      return everything(opts);
  }
}
