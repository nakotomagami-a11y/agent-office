/**
 *   pnpm --filter @agent-office/web test src/modules/summon/format/queued-title.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { queuedTitle } from "./queued-title";

const wake = (label: string) =>
  `[background task finished] The backgrounded shell you started — ${label} — is no longer running.\nCheck its result (log output, files changed, exit status) and report back to the user.`;

test("a background-shell wake collapses to its description, not the command", () => {
  assert.equal(
    queuedTitle(wake("Run the corrected 4B training (`a — b; wsl -d Ubuntu -- bash x.sh`)")),
    "Background task finished: Run the corrected 4B training",
  );
});

test("a wake with no description falls back to the command", () => {
  assert.equal(queuedTitle(wake("`npm i\n  --force`")), "Background task finished: npm i --force");
});

test("a description that starts with a backtick still hides the command", () => {
  assert.equal(
    queuedTitle(wake("`pnpm build` in watch mode (`pnpm build --watch`)")),
    "Background task finished: pnpm build in watch mode",
  );
});

test("a description containing ` (`` survives; a bare command keeps its inner backticks", () => {
  assert.equal(queuedTitle(wake("Run tests (`vitest`) on CI (`x`)")), "Background task finished: Run tests (vitest) on CI");
  assert.equal(queuedTitle(wake("`a`b`")), "Background task finished: a`b");
});

test("a user message uses its first non-empty line, markdown stripped", () => {
  assert.equal(queuedTitle("\n\n## Fix the **login** `bug`\nmore detail"), "Fix the login bug");
  assert.equal(queuedTitle("> quoted ask"), "quoted ask");
});

test("identifiers and operators in a user message are not mangled", () => {
  assert.equal(queuedTitle("fix my_file_name.py: a -> b and 2 * 3"), "fix my_file_name.py: a -> b and 2 * 3");
});

test("an attachment-only message is titled by its image count", () => {
  const footer = (...paths: string[]) => `Attachments (read these with your tools):\n${paths.map((p) => `- ${p}`).join("\n")}`;
  const img = (n: number) => `C:\\Users\\me\\.claude\\projects\\p\\_uploads\\pasted-${n}.png`;
  assert.equal(queuedTitle(footer(img(1), img(2))), "(2 images)");
  assert.equal(queuedTitle(footer("C:\\a.pdf")), "(attachment)");
});
