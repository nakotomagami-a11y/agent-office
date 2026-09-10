/**
 * Pure mapping test for the production ConversationRunner — no spawn, no DB.
 * The actual spawn call (`startSummonRun`) is exercised separately by the
 * e2e dispatch test (runs.conversation-dispatch.e2e.test.ts) and by the
 * pre-existing runs.auth-e2e.test.ts.
 *
 *   npx tsx packages/domain/src/services/execution/conversation-runner.test.ts
 */
import assert from "node:assert";
import { buildSummonRequest } from "./conversation-runner";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

check("maps a full StartRunInput 1:1 into a SummonRequest", () => {
  const req = buildSummonRequest({
    agentId: "dev",
    instanceId: "s1",
    projectId: "proj",
    prompt: "do the thing",
    resumeSessionId: "sess-1",
    conversationId: "conv-1",
  });
  assert.deepEqual(req, {
    agentId: "dev",
    prompt: "do the thing",
    instanceId: "s1",
    projectId: "proj",
    resumeSessionId: "sess-1",
    conversationId: "conv-1",
    contextProfile: undefined,
  });
});

check("threads contextProfile through when supplied", () => {
  const req = buildSummonRequest({
    agentId: "dev", instanceId: "s1", projectId: "proj", prompt: "x",
    resumeSessionId: null, conversationId: "c", contextProfile: "deep",
  });
  assert.equal(req.contextProfile, "deep");
});

check('the "default" instance sentinel is omitted, not passed through literally', () => {
  const req = buildSummonRequest({
    agentId: "dev",
    instanceId: "default",
    projectId: null,
    prompt: "x",
    resumeSessionId: null,
    conversationId: "c",
  });
  assert.equal(req.instanceId, undefined);
});

check("null projectId / resumeSessionId become undefined, not null", () => {
  const req = buildSummonRequest({
    agentId: "dev",
    instanceId: "s2",
    projectId: null,
    prompt: "x",
    resumeSessionId: null,
    conversationId: "c",
  });
  assert.equal(req.projectId, undefined);
  assert.equal(req.resumeSessionId, undefined);
});

console.log(`\n${passed} passed`);
