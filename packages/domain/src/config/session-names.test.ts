/**
 *   pnpm --filter @agent-office/domain test src/config/session-names.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { SESSION_NAMES, sessionNames, sessionTopic } from "./session-names";

test("a session keeps its name when others join the roster, and no two share one", () => {
  const alone = sessionNames([{ instanceId: "dev-abc1" }]).get("dev-abc1");
  const crowded = sessionNames([{ instanceId: "x-1" }, { instanceId: "dev-abc1" }, { instanceId: "y-2" }]);
  assert.ok(alone && (SESSION_NAMES as readonly string[]).includes(alone));
  assert.equal(crowded.get("dev-abc1"), alone);
  const names = [...crowded.values()];
  assert.equal(new Set(names).size, names.length);
});

test("documented limit: a label taking a session's pool name moves that session to the next free one", () => {
  const first = sessionNames([{ instanceId: "a" }]).get("a")!;
  const names = sessionNames([{ instanceId: "a" }, { instanceId: "b", label: first.toLowerCase() }]);
  assert.equal(names.get("b"), first.toLowerCase());
  assert.notEqual(names.get("a")!.toLowerCase(), first.toLowerCase());
});

test("a roster bigger than the pool still gets unique names", () => {
  const roster = Array.from({ length: SESSION_NAMES.length + 5 }, (_, i) => ({ instanceId: `i-${i}` }));
  const names = [...sessionNames(roster).values()];
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, roster.length);
});

test("the topic is the gist of the first line, not the whole prompt", () => {
  assert.equal(sessionTopic("Please add a compact mode to the sidebar.\nMore details below"), "add a compact mode to the sidebar");
  assert.equal(sessionTopic("Can you fix `roster-group.tsx` drag?"), "fix roster-group.tsx drag");
  assert.equal(sessionTopic("Big task on our hands. Check the proposal in downloads"), "big task on our hands");
  assert.equal(sessionTopic("```\ncode only\n```"), null);
  assert.equal(sessionTopic("   "), null);
  assert.equal(sessionTopic(undefined), null);
  const long = sessionTopic("Migrate every schedule row to the new recurring format and backfill the anchors for old jobs");
  assert.ok(long && long.endsWith("…") && Array.from(long).length <= 43, long ?? "");
});

test("capitals that carry meaning survive, identifiers stay intact, a bare link falls through", () => {
  assert.equal(sessionTopic("API returns 500 on the export route"), "API returns 500 on the export route");
  assert.equal(sessionTopic("I want to debloat my windows 11"), "I want to debloat my windows 11");
  assert.equal(sessionTopic("Rename foo_bar in a_b_c.ts"), "rename foo_bar in a_b_c.ts");
  assert.equal(sessionTopic("[Image #1] fix this overlap"), "image #1 fix this overlap");
  assert.equal(sessionTopic("https://example.com/x\nFix the header chips"), "fix the header chips");
});

test("a pathological prompt stays fast: it runs on every project read", () => {
  const evil = `a b${",".repeat(100_000)}x`;
  const t0 = performance.now();
  sessionTopic(evil);
  sessionTopic(`${"word ".repeat(50_000)}`);
  assert.ok(performance.now() - t0 < 100, `took ${Math.round(performance.now() - t0)} ms`);
});
