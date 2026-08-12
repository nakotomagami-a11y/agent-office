import { randomUUID } from "node:crypto";
import { getDb } from "./connection";
import type { Workflow } from "../../types/index";

// Reusable, multi-step prompt library. Stored in the `saved_prompts` table
// for legacy reasons — see the type doc on `Workflow`.

interface WorkflowRow {
  id: string;
  title: string;
  body: string;
  category: string;
  created_at: number;
  use_count: number;
}

function rowToWorkflow(row: WorkflowRow): Workflow {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    createdAt: row.created_at,
    useCount: row.use_count,
  };
}

export function getWorkflows(opts: { category?: string; q?: string } = {}): Workflow[] {
  const { category, q } = opts;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (category) {
    conditions.push("category = ?");
    params.push(category);
  }
  if (q) {
    conditions.push("(title LIKE ? OR body LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = getDb().prepare(
    `SELECT * FROM saved_prompts ${where} ORDER BY created_at DESC`
  ).all(...params) as WorkflowRow[];
  return rows.map(rowToWorkflow);
}

export function getWorkflow(id: string): Workflow | null {
  const row = getDb().prepare(
    "SELECT * FROM saved_prompts WHERE id = ?"
  ).get(id) as WorkflowRow | undefined;
  return row ? rowToWorkflow(row) : null;
}

export function createWorkflow(data: { title: string; body: string; category?: string }): Workflow {
  const id = randomUUID();
  const now = Date.now();
  const category = data.category ?? "general";
  getDb().prepare(
    "INSERT INTO saved_prompts (id, title, body, category, created_at, use_count) VALUES (?, ?, ?, ?, ?, 0)"
  ).run(id, data.title, data.body, category, now);
  return { id, title: data.title, body: data.body, category, createdAt: now, useCount: 0 };
}

export function deleteWorkflow(id: string): void {
  getDb().prepare("DELETE FROM saved_prompts WHERE id = ?").run(id);
}

export function recordWorkflowUsage(id: string): void {
  getDb().prepare(
    "UPDATE saved_prompts SET use_count = use_count + 1 WHERE id = ?"
  ).run(id);
}

export function bulkInsertWorkflows(
  workflows: Array<{ title: string; body: string; category: string }>
): number {
  const db = getDb();
  const insert = db.prepare(
    "INSERT OR IGNORE INTO saved_prompts (id, title, body, category, created_at, use_count) VALUES (?, ?, ?, ?, ?, 0)"
  );
  // Deduplicate against existing rows by body
  const existing = new Set(
    (db.prepare("SELECT body FROM saved_prompts").all() as Array<{ body: string }>).map(r => r.body)
  );

  let inserted = 0;
  const seenBodies = new Set<string>();
  db.transaction(() => {
    for (const w of workflows) {
      if (existing.has(w.body) || seenBodies.has(w.body)) continue;
      seenBodies.add(w.body);
      insert.run(randomUUID(), w.title, w.body, w.category, Date.now());
      inserted++;
    }
  })();
  return inserted;
}
