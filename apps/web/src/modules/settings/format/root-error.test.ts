import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PROJECTS_ROOT_PROBLEMS } from "@agent-office/domain/config/projects-root";
import { ApiError } from "@/lib/api/fetch";
import { retryUnlessRefused, rootErrorCode } from "./root-error";

test("every code the server can refuse a root with has a message, so none renders as a raw key", () => {
  const raw: unknown = JSON.parse(readFileSync(join(process.cwd(), "messages", "en.json"), "utf8"));
  const errors = z.object({ settings: z.object({ root_errors: z.record(z.string(), z.string()) }) }).parse(raw).settings.root_errors;
  assert.deepEqual(Object.keys(errors).sort(), [...PROJECTS_ROOT_PROBLEMS].sort());
});

const refused = (code: string, status = 400) => new ApiError(status, code, undefined, { error: code });

test("a refused root's code comes through, so the page can say why", () => {
  assert.equal(rootErrorCode(refused("root_not_local")), "root_not_local");
  assert.equal(rootErrorCode(refused("root_is_drive_root")), "root_is_drive_root");
});

test("anything else is not a root error", () => {
  assert.equal(rootErrorCode(refused("provider_required")), null);
  assert.equal(rootErrorCode(new Error("root_not_local")), null, "only the server's code counts, not a message");
  assert.equal(rootErrorCode(null), null);
});

test("a refused root isn't retried; a server failure is, once", () => {
  assert.equal(retryUnlessRefused(0, refused("root_not_local")), false);
  assert.equal(retryUnlessRefused(0, refused("internal_error", 500)), true);
  assert.equal(retryUnlessRefused(1, refused("internal_error", 500)), false);
});
