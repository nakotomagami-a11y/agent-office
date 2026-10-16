import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { ApiError } from "@/lib/api/fetch";
import { MISSION_ERROR_KEYS, missionFailure } from "./mission-errors";

const refused = (status: number, data: Record<string, unknown>, fields?: Record<string, string[]>) =>
  new ApiError(status, String(data.error ?? ""), fields, data);

test("every code the mission routes can send has a message, so none renders as a raw key", () => {
  const raw: unknown = JSON.parse(readFileSync(join(process.cwd(), "messages", "en.json"), "utf8"));
  const errors = z.object({ missions: z.object({ errors: z.record(z.string(), z.string()) }) }).parse(raw).missions.errors;
  const missing = MISSION_ERROR_KEYS.filter((k) => !errors[k]);
  assert.deepEqual(missing, []);
});

test("a known code maps to itself; the hint is not used", () => {
  assert.deepEqual(missionFailure(refused(409, { error: "seat_taken", hint: "Another device…" })), { key: "seat_taken", hint: null, detail: null });
  assert.equal(missionFailure(refused(409, { error: "repo_public", hint: "x" })).key, "repo_public");
  assert.equal(missionFailure(refused(502, { error: "gh_failed", hint: "x", detail: "HTTP 502" })).detail, "HTTP 502");
  assert.equal(missionFailure(refused(403, { error: "forbidden" })).key, "forbidden");
});

test("a cap over budget is named, not shown as a zod path", () => {
  const e = refused(400, { error: "validation_failed" }, { capUsd: ["cap_over_budget"] });
  assert.equal(missionFailure(e).key, "cap_over_budget");
  assert.equal(missionFailure(refused(400, { error: "validation_failed" }, { "seats.0.seat": ["seat_id"] })).key, "validation_failed");
});

test("an unknown code falls back to the hint, then to the status", () => {
  assert.deepEqual(missionFailure(refused(409, { error: "brand_new", hint: "Do the thing." })), { key: "unknown", hint: "Do the thing.", detail: null });
  assert.equal(missionFailure(refused(500, {})).key, "server");
  assert.equal(missionFailure(refused(404, {})).key, "not_found");
  assert.equal(missionFailure(refused(418, {})).key, "unknown");
});

test("no answer at all is a network failure", () => {
  assert.equal(missionFailure(new TypeError("Failed to fetch")).key, "network");
  assert.equal(missionFailure(new Error("boom")).key, "unknown");
});
