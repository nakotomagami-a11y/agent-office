/**
 * The sidebar renders three sections in a fixed order — Pinned, Council, then
 * the rest — and a group landing in two of them (or none) is a visible defect
 * rather than a style slip. The "council-only" case is the one that regressed
 * review: it leaves the trailing section empty, which the caller relies on to
 * decide whether to draw its header at all.
 */
import assert from "node:assert";
import { test } from "node:test";
import type { RosterGroupData } from "@/components/layout/roster-group";
import { splitRoster } from "./split-roster";

// `skills` is always an array off the wire (`asStringList` in agents.ts), and
// `categorize`'s no-room fallback reads it — a fixture omitting it would fail
// for a reason no real agent can hit.
const group = (agentId: string, room?: string) =>
  ({
    agentId,
    agent: { id: agentId, name: agentId, room, skills: [] },
    instances: [],
  }) as unknown as RosterGroupData;

test("a council agent is listed under Council, not with the rest", () => {
  const { councilList, restList } = splitRoster({
    groups: [group("cs-boardroom", "Council"), group("developer", "Engineering")],
    filter: "",
    pinnedIds: [],
  });
  assert.deepEqual(councilList.map((g) => g.agentId), ["cs-boardroom"]);
  assert.deepEqual(restList.map((g) => g.agentId), ["developer"]);
});

test("a pinned council agent is listed once, under Pinned", () => {
  const { pinnedList, councilList, restList } = splitRoster({
    groups: [group("cs-boardroom", "Council")],
    filter: "",
    pinnedIds: ["cs-boardroom"],
  });
  assert.deepEqual(pinnedList.map((g) => g.agentId), ["cs-boardroom"]);
  assert.deepEqual(councilList, []);
  assert.deepEqual(restList, []);
});

test("every group lands in exactly one of the three sections", () => {
  const groups = [
    group("cs-boardroom", "Council"),
    group("developer", "Engineering"),
    group("designer", "Design"),
    group("planner"),
  ];
  const { pinnedList, councilList, restList } = splitRoster({
    groups,
    filter: "",
    pinnedIds: ["developer"],
  });
  const placed = [...pinnedList, ...councilList, ...restList].map((g) => g.agentId);
  assert.equal(placed.length, groups.length);
  assert.deepEqual([...placed].sort(), groups.map((g) => g.agentId).sort());
});

test("a council-only roster leaves the rest section empty", () => {
  const { councilList, restList } = splitRoster({
    groups: [group("cs-boardroom", "Council")],
    filter: "",
    pinnedIds: [],
  });
  assert.equal(councilList.length, 1);
  assert.deepEqual(restList, [], "the caller draws no trailing header when this is empty");
});

test("the filter narrows all three sections together", () => {
  const { pinnedList, councilList, restList } = splitRoster({
    groups: [
      group("cs-boardroom", "Council"),
      group("developer", "Engineering"),
      group("designer", "Design"),
    ],
    filter: "board",
    pinnedIds: ["developer"],
  });
  assert.deepEqual(pinnedList, []);
  assert.deepEqual(councilList.map((g) => g.agentId), ["cs-boardroom"]);
  assert.deepEqual(restList, []);
});

test("a room that differs only by surrounding space or case still counts as Council", () => {
  const { councilList } = splitRoster({
    groups: [group("a", " Council"), group("b", "council"), group("c", "COUNCIL ")],
    filter: "",
    pinnedIds: [],
  });
  assert.deepEqual(councilList.map((g) => g.agentId), ["a", "b", "c"]);
});

test("an agent with no room at all is not a council member", () => {
  const { councilList, restList } = splitRoster({
    groups: [group("planner")],
    filter: "",
    pinnedIds: [],
  });
  assert.deepEqual(councilList, []);
  assert.deepEqual(restList.map((g) => g.agentId), ["planner"]);
});
