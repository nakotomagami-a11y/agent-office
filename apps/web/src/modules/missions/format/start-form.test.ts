import assert from "node:assert";
import { test } from "node:test";
import { agentInstalled, defaultAgent, deviceTypes, missingBits, seatNameOk, type StartDraft } from "./start-form";

const ok: StartDraft = {
  title: "Media", goal: "Done when…", budgetUsd: 20, capUsd: 5,
  seats: [{ seat: "coordinator", agent: "orchestrator" }, { seat: "linux", agent: "developer" }],
  installed: ["developer", "orchestrator"],
};

test("a complete draft misses nothing", () => {
  assert.deepEqual(missingBits(ok), []);
});

test("each missing piece is named once, in form order", () => {
  assert.deepEqual(missingBits({ ...ok, title: " ", goal: "" }), ["title", "goal"]);
  assert.deepEqual(missingBits({ ...ok, budgetUsd: null }), ["budget"]);
  assert.deepEqual(missingBits({ ...ok, capUsd: 0 }), ["cap"]);
  assert.deepEqual(missingBits({ ...ok, capUsd: 25 }), ["cap_within_budget"]);
  assert.deepEqual(missingBits({ ...ok, seats: [...ok.seats, { seat: "linux", agent: "developer" }] }), ["unique_seats"]);
  assert.deepEqual(missingBits({ ...ok, seats: [...ok.seats, { seat: "9lives", agent: "developer" }] }), ["seat_names"]);
});

test("a seat whose agent is not installed here, or agents not loaded yet, blocks Start", () => {
  assert.deepEqual(missingBits({ ...ok, seats: [...ok.seats, { seat: "macos", agent: "ghost" }] }), ["agents"]);
  assert.deepEqual(missingBits({ ...ok, installed: undefined }), ["agents"]);
  assert.equal(agentInstalled(null, ["developer"]), false);
});

test("defaults prefer the template's agents, else the first installed, else none", () => {
  assert.equal(defaultAgent(true, ["developer", "orchestrator"]), "orchestrator");
  assert.equal(defaultAgent(false, ["orchestrator", "developer"]), "developer");
  assert.equal(defaultAgent(true, ["reviewer", "developer"]), "reviewer");
  assert.equal(defaultAgent(false, []), null);
});

test("seat names are ids, never the reserved recipients", () => {
  assert.equal(seatNameOk("linux-2"), true);
  assert.equal(seatNameOk("human"), false);
  assert.equal(seatNameOk("all"), false);
  assert.equal(seatNameOk(""), false);
});

test("device types count real OSes only", () => {
  assert.equal(deviceTypes([{ os: "any" }, { os: "linux" }, { os: "linux" }, { os: "darwin" }]), 2);
  assert.equal(deviceTypes([{ os: "any" }]), 0);
});
