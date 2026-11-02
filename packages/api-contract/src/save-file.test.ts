import assert from "node:assert";
import { test } from "node:test";
import { saveFileSchema } from "./schemas";

test("a bundle from an older build still imports, minus its office layout and history", () => {
  const parsed = saveFileSchema.safeParse({
    version: 1,
    exportedAt: "2026-10-01T00:00:00.000Z",
    project: { id: "p", meta: { name: "P" }, memory: "" },
    agents: [],
    office: { grid: "[]", decorations: null, agents: null, grassColor: null },
    history: [{ agentId: "a", instanceId: "a-1", transcript: "[]" }],
  });
  assert.ok(parsed.success);
  assert.ok(!("office" in parsed.data));
  assert.ok(!("history" in parsed.data));
});
