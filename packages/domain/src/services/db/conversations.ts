// Conversations + durable message queue — the server-authoritative chat store.
// A conversation is one chat thread for an (agentId, instanceId) slot. Turns are
// top-level runs tagged with `conversation_id` (see db/runs.ts). The queue is a
// strict FIFO owned here, not on the client. See docs/chat-refactor.md.

import { randomUUID } from "node:crypto";
import { getDb } from "./connection";
import type { PersistedRun } from "../../types/index";

export type ConversationStatus = "idle" | "running" | "needs_attention";

export interface ConversationRow {
  id: string;
  agentId: string;
  instanceId: string;
  projectId: string | null;
  sessionId: string | null;
  status: ConversationStatus;
  activeRunId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface RawConversationRow {
  id: string;
  agent_id: string;
  instance_id: string;
  project_id: string | null;
  session_id: string | null;
  status: string;
  active_run_id: string | null;
  created_at: number;
  updated_at: number;
}

function toConversation(r: RawConversationRow): ConversationRow {
  return {
    id: r.id,
    agentId: r.agent_id,
    instanceId: r.instance_id,
    projectId: r.project_id,
    sessionId: r.session_id,
    status: r.status as ConversationStatus,
    activeRunId: r.active_run_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getConversation(id: string): ConversationRow | null {
  const row = getDb().prepare("SELECT * FROM conversations WHERE id = ?").get(id) as RawConversationRow | undefined;
  return row ? toConversation(row) : null;
}

/** The current (most recent) conversation for a slot, or null if none yet.
 *  Tie-broken by `rowid` (SQLite's implicit insert-order column), not just
 *  `created_at`: two conversations for the same slot CAN share a millisecond
 *  (rapid "New Thread", or two near-simultaneous creates), and `created_at`
 *  alone leaves SQLite's tie order unspecified — which could silently return
 *  the STALE conversation as "current". `rowid` is always insert-ordered, so
 *  the tie always resolves to the one actually created last. */
export function getActiveConversation(agentId: string, instanceId: string): ConversationRow | null {
  const row = getDb()
    .prepare("SELECT * FROM conversations WHERE agent_id = ? AND instance_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .get(agentId, instanceId) as RawConversationRow | undefined;
  return row ? toConversation(row) : null;
}

export function createConversation(
  agentId: string,
  instanceId: string,
  projectId: string | null,
  sessionId: string | null = null,
): ConversationRow {
  const now = Date.now();
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO conversations (id, agent_id, instance_id, project_id, session_id, status, active_run_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'idle', NULL, ?, ?)`,
    )
    .run(id, agentId, instanceId, projectId, sessionId, now, now);
  return { id, agentId, instanceId, projectId, sessionId, status: "idle", activeRunId: null, createdAt: now, updatedAt: now };
}

/** Get the slot's current conversation, creating an idle one if none exists. */
export function ensureConversation(agentId: string, instanceId: string, projectId: string | null): ConversationRow {
  return getActiveConversation(agentId, instanceId) ?? createConversation(agentId, instanceId, projectId);
}

/** Start a fresh conversation for a slot ("New thread") — new row, null session,
 *  empty queue. The old conversation and its queue are left behind intact. */
export function startNewConversation(agentId: string, instanceId: string, projectId: string | null): ConversationRow {
  return createConversation(agentId, instanceId, projectId, null);
}

export interface ConversationPatch {
  status?: ConversationStatus;
  activeRunId?: string | null;
  sessionId?: string | null;
  projectId?: string | null;
}

export function updateConversation(id: string, patch: ConversationPatch): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, updatedAt: Date.now() };
  if (patch.status !== undefined) { sets.push("status = @status"); params.status = patch.status; }
  if (patch.activeRunId !== undefined) { sets.push("active_run_id = @activeRunId"); params.activeRunId = patch.activeRunId; }
  if (patch.sessionId !== undefined) { sets.push("session_id = @sessionId"); params.sessionId = patch.sessionId; }
  if (patch.projectId !== undefined) { sets.push("project_id = @projectId"); params.projectId = patch.projectId; }
  if (sets.length === 0) return;
  getDb().prepare(`UPDATE conversations SET ${sets.join(", ")}, updated_at = @updatedAt WHERE id = @id`).run(params);
}

// ─── Queue (durable FIFO) ─────────────────────────────────────────────────────

export interface QueuedMessageRow {
  id: string;
  text: string;
  attachments: string | null;
  position: number;
  createdAt: number;
}

interface RawQueuedRow { id: string; text: string; attachments: string | null; position: number; created_at: number }

const toQueued = (r: RawQueuedRow): QueuedMessageRow => ({
  id: r.id, text: r.text, attachments: r.attachments, position: r.position, createdAt: r.created_at,
});

export function listQueue(conversationId: string): QueuedMessageRow[] {
  const rows = getDb()
    .prepare("SELECT id, text, attachments, position, created_at FROM queued_messages WHERE conversation_id = ? ORDER BY position ASC")
    .all(conversationId) as RawQueuedRow[];
  return rows.map(toQueued);
}

/** Append a message to the end of the conversation's queue. */
export function enqueueMessage(conversationId: string, text: string, attachments: string | null = null): QueuedMessageRow {
  const db = getDb();
  const now = Date.now();
  const id = randomUUID();
  const row = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM queued_messages WHERE conversation_id = ?").get(conversationId) as { pos: number };
  const position = row.pos;
  db.prepare(
    "INSERT INTO queued_messages (id, conversation_id, text, attachments, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, conversationId, text, attachments, position, now);
  return { id, text, attachments, position, createdAt: now };
}

/** Remove and return the front (lowest position) queued message, atomically. */
export function dequeueMessage(conversationId: string): QueuedMessageRow | null {
  const db = getDb();
  return db.transaction(() => {
    const raw = db
      .prepare("SELECT id, text, attachments, position, created_at FROM queued_messages WHERE conversation_id = ? ORDER BY position ASC LIMIT 1")
      .get(conversationId) as RawQueuedRow | undefined;
    if (!raw) return null;
    db.prepare("DELETE FROM queued_messages WHERE id = ?").run(raw.id);
    return toQueued(raw);
  })();
}

export function removeQueuedMessage(conversationId: string, messageId: string): void {
  getDb().prepare("DELETE FROM queued_messages WHERE conversation_id = ? AND id = ?").run(conversationId, messageId);
}

export function clearQueue(conversationId: string): void {
  getDb().prepare("DELETE FROM queued_messages WHERE conversation_id = ?").run(conversationId);
}

/** Atomically replace the whole queue with `items` (positions = array order),
 *  preserving caller-provided ids. Used by the conversation service to persist
 *  the state machine's queue after a transition. */
export function replaceQueue(
  conversationId: string,
  items: Array<{ id: string; text: string; attachments?: string | null }>,
): void {
  const db = getDb();
  const del = db.prepare("DELETE FROM queued_messages WHERE conversation_id = ?");
  const ins = db.prepare(
    "INSERT INTO queued_messages (id, conversation_id, text, attachments, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const now = Date.now();
  db.transaction(() => {
    del.run(conversationId);
    items.forEach((m, i) => ins.run(m.id, conversationId, m.text, m.attachments ?? null, i, now));
  })();
}

export function queueLength(conversationId: string): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM queued_messages WHERE conversation_id = ?").get(conversationId) as { n: number };
  return row.n;
}

// ─── Turns (top-level runs of a conversation, oldest first) ───────────────────

interface RunRow {
  id: string; agent_id: string; agent_name: string; instance_id: string;
  instance_label: string | null; project_id: string | null; session_id: string | null;
  status: string; exit_code: number | null; prompt: string; output: string;
  tokens_in: number; tokens_out: number; cost_usd: number; dur_ms: number | null;
  cache_creation_tokens: number | null; cache_read_tokens: number | null;
  model: string; effort: string; cwd: string | null; started_at: number; ended_at: number | null;
  parent_run_id: string | null; account_id: string | null; conversation_id: string | null;
}

function rowToRun(row: RunRow): PersistedRun {
  return {
    id: row.id, agentId: row.agent_id, agentName: row.agent_name,
    instanceId: row.instance_id === "default" ? undefined : row.instance_id,
    instanceLabel: row.instance_label ?? undefined,
    projectId: row.project_id ?? undefined, sessionId: row.session_id ?? undefined,
    status: row.status as "running" | "done" | "error",
    exitCode: row.exit_code ?? undefined, prompt: row.prompt, output: row.output,
    tokensIn: row.tokens_in, tokensOut: row.tokens_out, cost: row.cost_usd,
    cacheCreationTokens: row.cache_creation_tokens ?? undefined,
    cacheReadTokens: row.cache_read_tokens ?? undefined,
    durMs: row.dur_ms ?? (row.ended_at != null ? row.ended_at - row.started_at : 0),
    model: row.model, effort: row.effort, cwd: row.cwd ?? undefined, ts: row.started_at,
    parentRunId: row.parent_run_id ?? undefined, accountId: row.account_id ?? undefined,
    conversationId: row.conversation_id ?? undefined,
  };
}

/** Top-level turns (runs) of a conversation, oldest → newest. */
export function listConversationTurns(conversationId: string): PersistedRun[] {
  const rows = getDb()
    .prepare("SELECT * FROM runs WHERE conversation_id = ? AND parent_run_id IS NULL ORDER BY started_at ASC")
    .all(conversationId) as RunRow[];
  return rows.map(rowToRun);
}

/** The most recent top-level turn of a conversation (used to derive the prompt
 *  a Retry re-runs, and the terminal state a needs_attention card shows). */
export function latestConversationTurn(conversationId: string): PersistedRun | null {
  const row = getDb()
    .prepare("SELECT * FROM runs WHERE conversation_id = ? AND parent_run_id IS NULL ORDER BY started_at DESC LIMIT 1")
    .get(conversationId) as RunRow | undefined;
  return row ? rowToRun(row) : null;
}
