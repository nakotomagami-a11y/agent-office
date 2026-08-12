import { getDb } from "./connection";

// ─── Transcripts ────────────────────────────────────────────────────────────────

export interface TranscriptRow {
  items: string;
  activeRunId: string | null;
  sessionId: string | null;
  /** JSON-encoded `Array<{ id: string; text: string }>`. Empty array = none. */
  queuedMessages: string;
  updatedAt: number;
}

export function getTranscript(agentId: string, instanceId: string): TranscriptRow | null {
  const row = getDb().prepare(
    "SELECT items, active_run_id, session_id, queued_messages, updated_at FROM transcripts WHERE agent_id = ? AND instance_id = ?"
  ).get(agentId, instanceId) as {
    items: string;
    active_run_id: string | null;
    session_id: string | null;
    queued_messages: string | null;
    updated_at: number;
  } | undefined;
  if (!row) return null;
  return {
    items: row.items,
    activeRunId: row.active_run_id,
    sessionId: row.session_id,
    queuedMessages: row.queued_messages ?? "[]",
    updatedAt: row.updated_at,
  };
}

export function saveTranscript(
  agentId: string,
  instanceId: string,
  items: string,
  activeRunId: string | null,
  sessionId: string | null,
  queuedMessages: string = "[]",
): void {
  getDb().prepare(`
    INSERT INTO transcripts (agent_id, instance_id, items, active_run_id, session_id, queued_messages, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent_id, instance_id) DO UPDATE SET
      items=excluded.items, active_run_id=excluded.active_run_id,
      session_id=excluded.session_id, queued_messages=excluded.queued_messages,
      updated_at=excluded.updated_at
  `).run(agentId, instanceId, items, activeRunId, sessionId, queuedMessages, Date.now());
}

export function clearTranscript(agentId: string, instanceId: string): void {
  getDb().prepare("DELETE FROM transcripts WHERE agent_id = ? AND instance_id = ?").run(agentId, instanceId);
}

export function listAgentTranscripts(agentId: string): Array<{ instanceId: string; sessionId: string | null; updatedAt: number }> {
  const rows = getDb().prepare(
    "SELECT instance_id, session_id, updated_at FROM transcripts WHERE agent_id = ? ORDER BY updated_at DESC"
  ).all(agentId) as Array<{ instance_id: string; session_id: string | null; updated_at: number }>;
  return rows.map(r => ({ instanceId: r.instance_id, sessionId: r.session_id, updatedAt: r.updated_at }));
}

// ─── Drafts ────────────────────────────────────────────────────────────────────

export function getDraft(agentId: string, instanceId: string): string {
  const row = getDb().prepare(
    "SELECT text FROM drafts WHERE agent_id = ? AND instance_id = ?"
  ).get(agentId, instanceId) as { text: string } | undefined;
  return row?.text ?? "";
}

export function saveDraft(agentId: string, instanceId: string, text: string): void {
  if (text) {
    getDb().prepare(`
      INSERT INTO drafts (agent_id, instance_id, text, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(agent_id, instance_id) DO UPDATE SET text=excluded.text, updated_at=excluded.updated_at
    `).run(agentId, instanceId, text, Date.now());
  } else {
    clearDraft(agentId, instanceId);
  }
}

export function clearDraft(agentId: string, instanceId: string): void {
  getDb().prepare("DELETE FROM drafts WHERE agent_id = ? AND instance_id = ?").run(agentId, instanceId);
}
