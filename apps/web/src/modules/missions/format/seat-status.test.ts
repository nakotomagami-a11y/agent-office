import assert from "node:assert";
import { test } from "node:test";
import type { HubSeatView } from "@agent-office/domain/types";
import { canClaim, hubSeatStatus, startedSeatStatus } from "./seat-status";

const seat = (over: Partial<HubSeatView>): HubSeatView => ({ seat: "linux", agent: "developer", os: "linux", brief: "", taken: false, mine: false, fits: true, ...over });

test("only an open seat that fits this device can be claimed", () => {
  assert.equal(canClaim(seat({})), true);
  assert.equal(canClaim(seat({ taken: true })), false);
  assert.equal(canClaim(seat({ mine: true })), false);
  assert.equal(canClaim(seat({ fits: false })), false);
});

test("a join-list seat: a pending claim first, then mine, taken, wrong OS, open", () => {
  assert.equal(hubSeatStatus(seat({ taken: true }), true).key, "pending");
  assert.equal(hubSeatStatus(seat({ mine: true, taken: true }), false).key, "mine");
  assert.equal(hubSeatStatus(seat({ taken: true, fits: false }), false).key, "taken");
  assert.equal(hubSeatStatus(seat({ fits: false }), false).key, "wrong_os");
  assert.deepEqual(hubSeatStatus(seat({}), false), { key: "open", tone: "ok" });
});

test("a seat after Start: before the first fold, then running here, accepted, wanted, waiting", () => {
  assert.equal(startedSeatStatus(null, undefined, true).key, "starting");
  assert.equal(startedSeatStatus(null, undefined, false).key, "waiting");
  assert.equal(startedSeatStatus({ mine: true, device: "pc" }, undefined, true).key, "running_here");
  assert.deepEqual(startedSeatStatus({ mine: false, device: "mba" }, undefined, false), { key: "accepted", tone: "ok", device: "mba" });
  assert.deepEqual(startedSeatStatus({ mine: false, device: null }, { commentId: 1, seat: "macos", device: "mba" }, false), { key: "wanted", tone: "wait", device: "mba" });
  assert.equal(startedSeatStatus({ mine: false, device: null }, undefined, false).key, "waiting");
});
