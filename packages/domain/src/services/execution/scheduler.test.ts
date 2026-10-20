/**
 * A job pointed at another seat must not resume, or be adopted by, the old seat's conversation.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/scheduler.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import Database from "better-sqlite3";
import { createSchema } from "../db/migrations";
import { createJob, reassignJob } from "./scheduler";

const mem = new Database(":memory:");
mem.pragma("foreign_keys = ON");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

const resumeJob = () => createJob({
  fireAt: Date.now() + 60_000,
  reason: "rate-limit",
  summonRequest: { agentId: "dev", prompt: "continue", projectId: "p", instanceId: "dev-1", conversationId: "conv-1", resumeSessionId: "sess-1" },
});

test("reassigning to another seat drops the conversation and session it would have resumed", () => {
  for (const target of [{ instanceId: "dev-2" }, { agentId: "qa" }, { projectId: "q" }]) {
    const req = reassignJob(resumeJob().id, target)!.summonRequest;
    assert.equal(req.conversationId, undefined, JSON.stringify(target));
    assert.equal(req.resumeSessionId, undefined, JSON.stringify(target));
  }
});

test("re-arming on the same seat keeps them", () => {
  const req = reassignJob(resumeJob().id, { instanceId: "dev-1" })!.summonRequest;
  assert.equal(req.conversationId, "conv-1");
  assert.equal(req.resumeSessionId, "sess-1");
});
