/**
 *   pnpm --filter @agent-office/domain test src/config/session-names.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { SESSION_NAMES, sessionNames, sessionTopic } from "./session-names";

test("a session keeps its name: same id, same name, whatever else is in the roster", () => {
  const alone = sessionNames([{ instanceId: "dev-abc1" }]).get("dev-abc1");
  const crowded = sessionNames([{ instanceId: "x-1" }, { instanceId: "dev-abc1" }, { instanceId: "y-2" }]);
  assert.ok(alone && (SESSION_NAMES as readonly string[]).includes(alone));
  const names = [...crowded.values()];
  assert.equal(new Set(names).size, names.length, "no two sessions share a name");
});

test("a label wins and is never handed to another session", () => {
  const first = sessionNames([{ instanceId: "a" }]).get("a")!;
  const names = sessionNames([{ instanceId: "a" }, { instanceId: "b", label: first.toLowerCase() }]);
  assert.equal(names.get("b"), first.toLowerCase());
  assert.notEqual(names.get("a")!.toLowerCase(), first.toLowerCase(), "the unlabelled one moved off the taken name");
});

test("a roster bigger than the pool still gets unique names", () => {
  const roster = Array.from({ length: SESSION_NAMES.length + 5 }, (_, i) => ({ instanceId: `i-${i}` }));
  const names = [...sessionNames(roster).values()];
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, roster.length);
});

test("the topic is the gist of the first line, not the whole prompt", () => {
  assert.equal(sessionTopic("Please add a compact mode to the sidebar.\nMore details below"), "add a compact mode to the sidebar");
  assert.equal(sessionTopic("Can you fix `roster-group.tsx` drag?"), "fix roster-group.tsx drag");
  assert.equal(sessionTopic("```\ncode only\n```"), null);
  assert.equal(sessionTopic("   "), null);
  assert.equal(sessionTopic("Big task on our hands. Check the proposal in downloads"), "big task on our hands");
  assert.equal(sessionTopic("Fix it. Then the sidebar"), "fix it. Then the sidebar");
  assert.equal(sessionTopic(undefined), null);
  const long = sessionTopic("Migrate every schedule row to the new recurring format and backfill the anchors for old jobs");
  assert.ok(long && long.endsWith("…") && long.length <= 43, long ?? "");
});
