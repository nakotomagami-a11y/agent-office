/**
 * A refused session removal must reach the client as a 409 carrying the code and
 * the sessions concerned: the UI's keep/discard choice is built from that list.
 * Before this mapping, the message ("... not found" in git's stderr) could 404.
 */
import assert from "node:assert";
import { test } from "node:test";
import { projects } from "@agent-office/domain/services";
import { tryService } from "./api-helpers";

const session = { projectId: "p", instanceId: "developer-abc", agentId: "developer", uncommitted: 2, unmerged: 0 };

for (const code of ["session_running", "session_has_work", "worktree_remove_failed"] as const) {
  test(`${code} answers 409 with the sessions`, async () => {
    const res = await tryService(() => {
      throw new projects.SessionRemovalError(code, [session], "path not found");
    });
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: code, sessions: [session], detail: "path not found" });
  });
}
