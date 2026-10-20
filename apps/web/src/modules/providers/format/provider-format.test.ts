import assert from "node:assert";
import { test } from "node:test";
import { COST_BASES, PROVIDER_STATUS_REASONS, PROVIDER_STATUS_REASON_POLICY } from "@agent-office/domain/config/providers";
import { ApiError } from "@/lib/api/fetch";
import { REASON_ACTION, allTiersShare, baseUrlProblem, canContinueAnyway, costDisplay, formatPerMTok, reasonOfError, sameBaseUrl } from "./provider-format";

test("Continue anyway is offered for exactly the reasons the server accepts", () => {
  for (const reason of PROVIDER_STATUS_REASONS) {
    assert.equal(canContinueAnyway(reason), PROVIDER_STATUS_REASON_POLICY[reason] === "accept", reason);
  }
  assert.equal(canContinueAnyway(undefined), false);
});

test("every reason has an action, and sign-in and editing are told apart", () => {
  for (const reason of PROVIDER_STATUS_REASONS) assert.ok(REASON_ACTION[reason], reason);
  assert.equal(REASON_ACTION.not_signed_in, "sign_in");
  assert.equal(REASON_ACTION.key_invalid, "edit");
});

test("a reason is read from a 409 body or from the message, and from nothing else", () => {
  assert.equal(reasonOfError(new ApiError(409, "provider_not_ready", undefined, { reason: "key_invalid" })), "key_invalid");
  assert.equal(reasonOfError(new ApiError(400, "base_url_invalid")), "base_url_invalid");
  assert.equal(reasonOfError(new ApiError(400, "provider_required")), null);
  assert.equal(reasonOfError(new ApiError(409, "provider_not_ready", undefined, { reason: "made_up" })), null);
  assert.equal(reasonOfError(new Error("key_invalid")), null);
});

test("a base URL with credentials is named as such, and an empty one is fine", () => {
  assert.equal(baseUrlProblem(""), null);
  assert.equal(baseUrlProblem("  "), null);
  assert.equal(baseUrlProblem("http://localhost:11434/v1"), null);
  assert.equal(baseUrlProblem("http://user:pass@host/v1"), "credentials");
  assert.equal(baseUrlProblem("ftp://host"), "invalid");
  assert.equal(baseUrlProblem("not a url"), "invalid");
  assert.equal(baseUrlProblem("http://host/v1?key=1"), "invalid");
});

test("the same address in a different spelling is the same address", () => {
  assert.ok(sameBaseUrl("HTTP://LocalHost:11434/v1/", "http://localhost:11434/v1"));
  assert.ok(sameBaseUrl("", undefined));
  assert.ok(!sameBaseUrl("http://localhost:1234/v1", "http://localhost:11434/v1"));
  assert.ok(!sameBaseUrl("", "http://localhost:11434/v1"));
});

test("one model for every tier is recognised only when all three match", () => {
  assert.equal(allTiersShare({ haiku: "m", sonnet: "m", opus: "m" }), "m");
  assert.equal(allTiersShare({ haiku: "a", sonnet: "m", opus: "m" }), null);
  assert.equal(allTiersShare({}), null);
});

test("every cost basis renders as something, and unknown is never a dollar amount", () => {
  for (const basis of COST_BASES) assert.ok(costDisplay(1.5, basis).kind, basis);
  assert.deepEqual(costDisplay(0, "unknown"), { kind: "unknown" });
  assert.deepEqual(costDisplay(0, "free"), { kind: "free" });
  assert.deepEqual(costDisplay(2, "estimated"), { kind: "estimated", usd: 2 });
  assert.deepEqual(costDisplay(3, undefined), { kind: "amount", usd: 3 });
  assert.deepEqual(costDisplay(3, "notional"), { kind: "amount", usd: 3 });
});

test("a price shows as per-million-tokens, and a missing one as nothing", () => {
  assert.equal(formatPerMTok(3), "$3.00/Mt");
  assert.equal(formatPerMTok(15), "$15/Mt");
  assert.equal(formatPerMTok(0.8), "$0.80/Mt");
  assert.equal(formatPerMTok(undefined), null);
  assert.equal(formatPerMTok(Number.NaN), null);
});
