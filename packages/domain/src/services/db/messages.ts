import { randomUUID } from "node:crypto";
import { getDb } from "./connection";
import { log } from "../infra/log";

// ─── Messages ────────────────────────────────────────────────────────────────

const MAX_USER_CONTENT = 2_000;
const MAX_ASSISTANT_CONTENT = 8_000;

export function insertMessages(opts: {
  runId: string; agentId: string; instanceId: string;
  userContent: string; assistantContent: string; ts: number;
}): void {
  if (!opts.assistantContent.trim()) return;
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO messages (id, run_id, agent_id, instance_id, role, content, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    insert.run(randomUUID(), opts.runId, opts.agentId, opts.instanceId, "user",
      opts.userContent.slice(0, MAX_USER_CONTENT), opts.ts);
    insert.run(randomUUID(), opts.runId, opts.agentId, opts.instanceId, "assistant",
      opts.assistantContent.slice(0, MAX_ASSISTANT_CONTENT), Date.now());
  })();
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  runId: string;
  ts: number;
}

export function getRecentMessages(agentId: string, instanceId: string, limit = 8): HistoryMessage[] {
  const rows = getDb().prepare(`
    SELECT role, content, run_id, ts FROM messages
    WHERE agent_id = ? AND instance_id = ?
    ORDER BY ts DESC LIMIT ?
  `).all(agentId, instanceId, limit) as Array<{ role: string; content: string; run_id: string; ts: number }>;
  return rows.reverse().map(r => ({ role: r.role as "user" | "assistant", content: r.content, runId: r.run_id, ts: r.ts }));
}

export function searchMessagesForAgent(agentId: string, instanceId: string, ftsQuery: string, limit = 10): HistoryMessage[] {
  try {
    const rows = getDb().prepare(`
      SELECT m.role, m.content, m.run_id, m.ts
      FROM messages_fts f JOIN messages m ON f.rowid = m.rowid
      WHERE messages_fts MATCH ? AND m.agent_id = ? AND m.instance_id = ?
      ORDER BY rank LIMIT ?
    `).all(ftsQuery, agentId, instanceId, limit) as Array<{ role: string; content: string; run_id: string; ts: number }>;
    return rows.map(r => ({ role: r.role as "user" | "assistant", content: r.content, runId: r.run_id, ts: r.ts }));
  } catch {
    return [];
  }
}

export function getRecentMessagesByProject(agentId: string, instanceId: string, projectId: string, limit = 8): HistoryMessage[] {
  const rows = getDb().prepare(`
    SELECT m.role, m.content, m.run_id, m.ts
    FROM messages m JOIN runs r ON m.run_id = r.id
    WHERE m.agent_id = ? AND m.instance_id = ? AND r.project_id = ?
    ORDER BY m.ts DESC LIMIT ?
  `).all(agentId, instanceId, projectId, limit) as Array<{ role: string; content: string; run_id: string; ts: number }>;
  return rows.reverse().map(r => ({ role: r.role as "user" | "assistant", content: r.content, runId: r.run_id, ts: r.ts }));
}

// ─── Tool calls ────────────────────────────────────────────────────────────────

/** Upserts on the CLI's `toolu_...` so one call is one row — see tool-calls.test.ts. */
export function insertToolCall(
  runId: string,
  name: string,
  input: unknown,
  ts: number,
  toolUseId?: string,
): void {
  try {
    const json = JSON.stringify(input);
    getDb().prepare(
      `INSERT INTO tool_calls (id, run_id, name, input, ts) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET input = excluded.input, ts = excluded.ts
       WHERE excluded.input IS NOT NULL AND excluded.input <> '{}' AND excluded.input <> ''`
    ).run(toolUseId || randomUUID(), runId, name, json, ts);
  } catch (err) {
    log.warn("toolcall.insert_failed", { runId, name, toolUseId, err: String(err) });
  }
}

/** First result wins: the CLI never sends two, and a replay must not move it later. */
export function markToolCallDone(toolUseId: string, doneTs: number): void {
  try {
    getDb().prepare("UPDATE tool_calls SET done_ts = ? WHERE id = ? AND done_ts IS NULL").run(doneTs, toolUseId);
  } catch (err) {
    log.warn("toolcall.done_failed", { toolUseId, err: String(err) });
  }
}

/** Deletes tool_calls rows older than `olderThanTs` — the 48h retention
 *  timer for the historical tool-call trail (see PersistedRun.toolCalls'
 *  doc comment). Called from execution/runs.ts's existing minutely `gc()`. */
export function pruneExpiredToolCalls(olderThanTs: number): number {
  try {
    return getDb().prepare("DELETE FROM tool_calls WHERE ts < ?").run(olderThanTs).changes;
  } catch (err) {
    log.warn("toolcall.prune_failed", { olderThanTs, err: String(err) });
    return 0;
  }
}

// ─── Recent prompts ────────────────────────────────────────────────────────────

const MAX_RECENT_PROMPTS = 10;

export function getRecentPrompts(agentId: string): string[] {
  const rows = getDb().prepare(
    "SELECT prompt FROM recent_prompts WHERE agent_id = ? ORDER BY used_at DESC LIMIT ?"
  ).all(agentId, MAX_RECENT_PROMPTS) as Array<{ prompt: string }>;
  return rows.map(r => r.prompt);
}

export function pushRecentPrompt(agentId: string, prompt: string): void {
  if (!prompt.trim()) return;
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM recent_prompts WHERE agent_id = ? AND prompt = ?").run(agentId, prompt);
    db.prepare("INSERT INTO recent_prompts (agent_id, prompt, used_at) VALUES (?, ?, ?)").run(agentId, prompt, Date.now());
    // Keep only most recent 10
    const ids = db.prepare(
      "SELECT id FROM recent_prompts WHERE agent_id = ? ORDER BY used_at DESC LIMIT -1 OFFSET ?"
    ).all(agentId, MAX_RECENT_PROMPTS) as Array<{ id: number }>;
    if (ids.length > 0) {
      db.prepare(`DELETE FROM recent_prompts WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids.map(r => r.id));
    }
  })();
}

export function getAllRecentPrompts(): Record<string, string[]> {
  const rows = getDb().prepare(
    "SELECT agent_id, prompt FROM recent_prompts ORDER BY agent_id, used_at DESC"
  ).all() as Array<{ agent_id: string; prompt: string }>;
  const out: Record<string, string[]> = {};
  for (const { agent_id, prompt } of rows) {
    if (!out[agent_id]) out[agent_id] = [];
    out[agent_id]!.push(prompt);
  }
  return out;
}
