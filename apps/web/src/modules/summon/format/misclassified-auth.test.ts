import assert from "node:assert";
import { test } from "node:test";
import { PROVIDERS } from "@agent-office/domain/config/providers";
import { misclassifiedAuthCode } from "./misclassified-auth";

const LOGGED_OUT = "Not logged in · Please run /login";

test("a subscription logout sentence still gets the Sign-in card", () => {
  assert.equal(misclassifiedAuthCode(LOGGED_OUT, false, "subscription"), "auth_expired");
});

test("the same sentence under any other provider never offers Sign in", () => {
  for (const provider of PROVIDERS.filter((p) => p !== "subscription")) {
    assert.equal(misclassifiedAuthCode(LOGGED_OUT, false, provider), null, provider);
    assert.equal(misclassifiedAuthCode("Invalid API key · Fix external API key", false, provider), null, provider);
  }
});

test("streaming, empty and long text are never re-classified", () => {
  assert.equal(misclassifiedAuthCode(LOGGED_OUT, true, "subscription"), null);
  assert.equal(misclassifiedAuthCode("   ", false, "subscription"), null);
  assert.equal(misclassifiedAuthCode(`${LOGGED_OUT} ${"x".repeat(300)}`, false, "subscription"), null);
});
