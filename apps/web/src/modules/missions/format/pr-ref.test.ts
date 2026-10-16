import assert from "node:assert";
import { test } from "node:test";
import type { HubView } from "@agent-office/domain/types";
import { hubMatches, parsePrRef } from "./pr-ref";

test("a number, #number, or a PR URL from any of its tabs", () => {
  assert.deepEqual(parsePrRef("12"), { pr: 12, repo: null });
  assert.deepEqual(parsePrRef(" #12 "), { pr: 12, repo: null });
  assert.deepEqual(parsePrRef("https://github.com/Owner/Repo/pull/34"), { pr: 34, repo: "owner/repo" });
  assert.deepEqual(parsePrRef("github.com/o/r/pull/34/files"), { pr: 34, repo: "o/r" });
  assert.deepEqual(parsePrRef("https://www.github.com/o/r/pull/34#issuecomment-99"), { pr: 34, repo: "o/r" });
});

test("anything else is not a PR link", () => {
  for (const bad of ["", "pr 12", "https://github.com/o/r/issues/3", "https://gitlab.com/o/r/pull/3", "github.com/o/pull/3"]) {
    assert.equal(parsePrRef(bad), null, bad);
  }
});

const hub = (over: Partial<HubView>): HubView => ({
  pr: 34, title: "t", goal: "", url: "https://github.com/o/r/pull/34", missionId: "abcd", manifestHash: "h", closed: false, seats: [], ...over,
});

test("a hub matches its number, and its repo when the link names one; a closed hub never", () => {
  assert.equal(hubMatches(hub({}), { pr: 34, repo: null }), true);
  assert.equal(hubMatches(hub({}), { pr: 34, repo: "o/r" }), true);
  assert.equal(hubMatches(hub({}), { pr: 34, repo: "other/r" }), false);
  assert.equal(hubMatches(hub({}), { pr: 35, repo: null }), false);
  assert.equal(hubMatches(hub({ closed: true }), { pr: 34, repo: null }), false);
});
