// Messages sent into a conversation's live CLI process (see execution/chat-session.ts). A row is
// written when the message goes to the CLI and gets its `run_id` when a turn reads it, so a message
// the process never read survives a crash and is sent again by the next one.

import { getDb } from "./connection";
import { asOrigin } from "./runs";
import type { ConversationInput, MessageOrigin } from "../../types/index";

interface RawInputRow {
  id: string;
  text: string;
  origin: string;
  run_id: string | null;
  sent_at: number;
  read_at: number | null;
}

const toInput = (r: RawInputRow): ConversationInput => ({
  id: r.id, text: r.text, origin: asOrigin(r.origin), runId: r.run_id, sentAt: r.sent_at, readAt: r.read_at,
});

const COLUMNS = "id, text, origin, run_id, sent_at, read_at";

export function insertRunInput(input: { id: string; conversationId: string; text: string; origin: MessageOrigin; sentAt: number }): void {
  getDb()
    .prepare("INSERT INTO run_inputs (id, conversation_id, text, origin, sent_at) VALUES (?, ?, ?, ?, ?)")
    .run(input.id, input.conversationId, input.text, input.origin, input.sentAt);
}

/** A turn read the message. `openedTurn`: it is that turn's prompt, not a message read mid-turn. */
export function markRunInputRead(id: string, runId: string, readAt: number, openedTurn: boolean): void {
  getDb()
    .prepare("UPDATE run_inputs SET run_id = ?, read_at = ?, opened_turn = ? WHERE id = ? AND run_id IS NULL")
    .run(runId, readAt, openedTurn ? 1 : 0, id);
}

export function getRunInput(id: string): (ConversationInput & { conversationId: string }) | null {
  const row = getDb().prepare(`SELECT ${COLUMNS}, conversation_id FROM run_inputs WHERE id = ?`).get(id) as
    | (RawInputRow & { conversation_id: string })
    | undefined;
  return row ? { ...toInput(row), conversationId: row.conversation_id } : null;
}

/** Sent and never read, oldest first. */
export function listPendingInputs(conversationId: string): ConversationInput[] {
  const rows = getDb()
    .prepare(`SELECT ${COLUMNS} FROM run_inputs WHERE conversation_id = ? AND run_id IS NULL ORDER BY sent_at ASC, rowid ASC`)
    .all(conversationId) as RawInputRow[];
  return rows.map(toInput);
}

export function deleteRunInput(conversationId: string, id: string): boolean {
  return getDb().prepare("DELETE FROM run_inputs WHERE conversation_id = ? AND id = ? AND run_id IS NULL").run(conversationId, id).changes > 0;
}

/** Messages each turn read mid-turn (not the one that opened it), keyed by run id. */
export function inputsReadByRuns(runIds: string[]): Map<string, ConversationInput[]> {
  const out = new Map<string, ConversationInput[]>();
  if (runIds.length === 0) return out;
  const rows = getDb()
    .prepare(`SELECT ${COLUMNS} FROM run_inputs WHERE run_id IN (${runIds.map(() => "?").join(",")}) AND opened_turn = 0
      ORDER BY read_at ASC, rowid ASC`)
    .all(...runIds) as RawInputRow[];
  for (const row of rows) {
    const list = out.get(row.run_id!);
    if (list) list.push(toInput(row));
    else out.set(row.run_id!, [toInput(row)]);
  }
  return out;
}
