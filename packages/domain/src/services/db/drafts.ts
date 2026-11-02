import { getDb } from "./connection";

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
