/**
 * `/` then Enter cleared the thread: the bare slash matched /clear and Enter ran it.
 *
 *   pnpm --filter @agent-office/web test src/modules/summon/format/composer-config.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { slashEnterRuns } from "./composer-config";

test("Enter runs a slash command only when it is typed in full", () => {
  assert.equal(slashEnterRuns("/clear", "/clear"), true);
  for (const partial of ["/", "/c", "/cl", "/clea"]) assert.equal(slashEnterRuns(partial, "/clear"), false, partial);
});
