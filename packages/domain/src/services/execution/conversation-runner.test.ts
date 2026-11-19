/**
 * The spawn request a conversation's process is started with — no spawn, no DB writes.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/conversation-runner.test.ts
 */
import assert from "node:assert";
import { summonRequestFor } from "./chat-session";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

const conv = { id: "conv-1", agentId: "dev", instanceId: "s1", projectId: "proj", sessionId: null };
const head = { id: "in-1", text: "do the thing", origin: "user" as const };

check("maps the conversation and its first message into a SummonRequest", () => {
  assert.deepEqual(summonRequestFor(conv, head, "sess-1", {}), {
    agentId: "dev",
    prompt: "do the thing",
    origin: "user",
    instanceId: "s1",
    projectId: "proj",
    resumeSessionId: "sess-1",
    conversationId: "conv-1",
    contextProfile: undefined,
    maxBudgetUsd: undefined,
  });
});

check("threads a loop round's remaining budget and the context profile through", () => {
  const req = summonRequestFor(conv, head, null, { maxBudgetUsd: 4.5, contextProfile: "deep" });
  assert.equal(req.maxBudgetUsd, 4.5);
  assert.equal(req.contextProfile, "deep");
});

check('the "default" instance sentinel is omitted, not passed through literally', () => {
  assert.equal(summonRequestFor({ ...conv, instanceId: "default" }, head, null, {}).instanceId, undefined);
});

check("null projectId / resumeSessionId become undefined, not null", () => {
  const req = summonRequestFor({ ...conv, projectId: null }, head, null, {});
  assert.equal(req.projectId, undefined);
  assert.equal(req.resumeSessionId, undefined);
});

console.log(`\n${passed} passed`);
