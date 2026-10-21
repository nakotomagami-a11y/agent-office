/**
 * "Clear ALL runs" deleted runs under conversations still pointing at them, so a chat stayed
 * "running" forever: the reconciler reads a missing run as "just spawned" (S2-14).
 *
 *   pnpm --filter @agent-office/server test src/routes/dev/seed/seed-route.test.ts
 */
import assert from "node:assert";
import { after, test } from "node:test";
import { db } from "@agent-office/domain/services";
import { POST } from "./route";

function seedRun(id: string, status: string): void {
  db.getDb().prepare(
    `INSERT INTO runs (id, agent_id, agent_name, instance_id, status, exit_code, prompt, output, model, effort, started_at)
     VALUES (?, 'dev', 'Dev', 'default', ?, NULL, 'p', '', 'm', 'high', 1)`,
  ).run(id, status);
}

function seedChat(id: string, status: string, runId: string): void {
  db.getDb().prepare(
    "INSERT INTO conversations (id, agent_id, instance_id, status, active_run_id, created_at, updated_at) VALUES (?,'dev','default',?,?,1,1)",
  ).run(id, status, runId);
}

test("clear-all-runs unsticks a chat pointing at a deleted run and keeps a live run", async () => {
  seedRun("seed-done", "done");
  seedRun("seed-live", "running");
  seedChat("seed-c1", "running", "seed-done");
  seedChat("seed-c2", "running", "seed-live");
  after(() => {
    db.getDb().prepare("DELETE FROM conversations WHERE id IN ('seed-c1', 'seed-c2')").run();
    db.getDb().prepare("DELETE FROM runs WHERE id = 'seed-live'").run();
  });

  const res = await POST(new Request("http://localhost/api/dev/seed", { method: "POST", body: JSON.stringify({ action: "clear-all-runs" }) }));
  assert.equal(res.status, 200);

  const chat = (id: string) => db.getDb().prepare("SELECT status, active_run_id FROM conversations WHERE id = ?").get(id);
  assert.deepEqual(chat("seed-c1"), { status: "needs_attention", active_run_id: null });
  assert.deepEqual(chat("seed-c2"), { status: "running", active_run_id: "seed-live" });
  assert.deepEqual(db.getDb().prepare("SELECT id FROM runs WHERE id LIKE 'seed-%'").all(), [{ id: "seed-live" }]);
});
