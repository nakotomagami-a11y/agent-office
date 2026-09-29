/**
 * RULE errors.machine-codes — every code carries an agent-facing remediation.
 * A new code added without one would fail silently: the agent gets a bare
 * snake_case string and has to guess what to do about it.
 */
import assert from "node:assert";
import { test } from "node:test";
import { RUN_ERROR_CODES, RUN_ERROR_REMEDIATION, remediationFor } from "./run-errors";

test("every run error code has a remediation", () => {
  const missing = RUN_ERROR_CODES.filter((c) => !RUN_ERROR_REMEDIATION[c]?.trim());
  assert.deepEqual(missing, [], "codes without agent-facing remediation");
});

test("remediations are actionable, not restatements of the code", () => {
  for (const c of RUN_ERROR_CODES) {
    const text = RUN_ERROR_REMEDIATION[c];
    assert.ok(text.length > 30, `${c}: remediation too short to be useful`);
    assert.ok(!text.includes(c), `${c}: remediation just restates the code`);
  }
});

test("remediationFor ignores unknown codes", () => {
  assert.equal(remediationFor("not_a_real_code"), undefined);
  assert.ok(remediationFor("auth_expired"));
});
