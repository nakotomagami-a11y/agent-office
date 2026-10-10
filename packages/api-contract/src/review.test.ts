import assert from "node:assert";
import { test } from "node:test";
import { prNumberSchema, reviewRejectSchema, reviewSubmitSchema } from "./review";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const line = { path: "src/a.ts", line: 3, side: "RIGHT", body: "why?" };

test("a review needs something to say, except an approval", () => {
  assert.strictEqual(reviewSubmitSchema.safeParse({ event: "REQUEST_CHANGES", body: " ", headRefOid: SHA }).success, false);
  assert.strictEqual(reviewSubmitSchema.safeParse({ event: "COMMENT", comments: [line], headRefOid: SHA }).success, true);
  assert.strictEqual(reviewSubmitSchema.safeParse({ event: "APPROVE", headRefOid: SHA }).success, true);
});

test("the reviewed head must be a full sha, sides and lines must be real", () => {
  assert.strictEqual(reviewSubmitSchema.safeParse({ event: "APPROVE", headRefOid: "abc123" }).success, false);
  assert.strictEqual(reviewSubmitSchema.safeParse({ event: "COMMENT", comments: [{ ...line, side: "BOTH" }], headRefOid: SHA }).success, false);
  assert.strictEqual(reviewSubmitSchema.safeParse({ event: "COMMENT", comments: [{ ...line, line: 0 }], headRefOid: SHA }).success, false);
  assert.strictEqual(
    reviewSubmitSchema.safeParse({ event: "COMMENT", comments: Array.from({ length: 101 }, () => line), headRefOid: SHA }).success,
    false,
  );
});

test("a rejection needs a reason", () => {
  assert.strictEqual(reviewRejectSchema.safeParse({ reason: "  ", headRefOid: SHA }).success, false);
  assert.deepStrictEqual(reviewRejectSchema.parse({ reason: " wrong approach ", headRefOid: SHA }).reason, "wrong approach");
});

test("PR numbers come from the path as positive integers", () => {
  assert.strictEqual(prNumberSchema.parse("12"), 12);
  for (const bad of ["0", "-1", "1.5", "abc", "99999999999", "0x10", "1e3", " 7", "07"]) assert.strictEqual(prNumberSchema.safeParse(bad).success, false, bad);
});

test("text with a NUL byte is refused at the boundary", () => {
  const reason = `bad${String.fromCharCode(0)}reason`;
  assert.strictEqual(reviewRejectSchema.safeParse({ reason, headRefOid: SHA }).success, false);
});
