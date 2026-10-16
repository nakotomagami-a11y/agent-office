import assert from "node:assert";
import { test } from "node:test";
import { MAX_USD } from "@agent-office/domain/config/missions";
import { parseUsd, usdOk } from "./money";

test("a decimal comma is a decimal point, never dropped", () => {
  assert.equal(parseUsd("2,50"), 2.5);
  assert.equal(parseUsd("2.50"), 2.5);
  assert.equal(parseUsd("0,5"), 0.5);
  assert.equal(parseUsd(",5"), 0.5);
});

test("plain amounts, and the half-typed ones on the way to them", () => {
  assert.equal(parseUsd("20"), 20);
  assert.equal(parseUsd(" 5 "), 5);
  assert.equal(parseUsd("2."), 2);
  assert.equal(parseUsd("2,"), 2);
});

test("anything else is refused rather than rewritten", () => {
  for (const bad of ["", "-5", "$5", "1,000", "1.2.3", "2,5,0", "1,2.3", "2.505", "5 usd", "1e3", "abc", "."]) {
    assert.equal(parseUsd(bad), null, `"${bad}" should not parse`);
  }
});

test("usdOk is the contract's range: above zero, at most MAX_USD", () => {
  assert.equal(usdOk(null), false);
  assert.equal(usdOk(0), false);
  assert.equal(usdOk(0.01), true);
  assert.equal(usdOk(MAX_USD), true);
  assert.equal(usdOk(MAX_USD + 0.01), false);
});

test("full-width digits and separators from an IME read as the amount they show", () => {
  assert.equal(parseUsd("２，５０"), 2.5);
  assert.equal(parseUsd("１０"), 10);
});
