import assert from "node:assert";
import { test } from "node:test";
import { ApiError } from "@/lib/api/fetch";
import { killErrorKey } from "./process-format";

test("killErrorKey maps the server's kill codes and falls back for anything else", () => {
  assert.strictEqual(killErrorKey(new ApiError(503, "ownership_unverified")), "kill_error_ownership_unverified");
  assert.strictEqual(killErrorKey(new ApiError(403, "forbidden")), "kill_error_forbidden");
  assert.strictEqual(killErrorKey(new ApiError(404, "not_found")), "kill_error_not_found");
  assert.strictEqual(killErrorKey(new ApiError(0, "Network error")), "kill_error_failed");
  assert.strictEqual(killErrorKey(new ApiError(500, "toString")), "kill_error_failed");
  assert.strictEqual(killErrorKey("nope"), "kill_error_failed");
});
