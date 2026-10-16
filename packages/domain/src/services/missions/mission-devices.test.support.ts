// Several devices sharing one GitHub, for mission tests that run the real actions, poller and
// poster end to end. Importing this sandboxes HOME (with one project, `proj`) before any domain
// module resolves its paths, so import it first.
import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { MissionSeat } from "../../types/index";

const sandbox = mkdtempSync(join(tmpdir(), "ao-mission-devices-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;
const claudeDir = join(sandbox, ".claude");
export const projectsRoot = join(sandbox, "root");
mkdirSync(join(claudeDir, "projects", "proj"), { recursive: true });
mkdirSync(join(projectsRoot, "proj"), { recursive: true });
writeFileSync(join(claudeDir, "agent-office-settings.json"), JSON.stringify({ projectsRoot, excluded: [], firstRunComplete: true }));
writeFileSync(join(claudeDir, "projects", "proj", "project.md"), "---\nname: \"Proj\"\nroster: []\n---\n");

const { createSchema } = await import("../db/migrations");
export const db = await import("../db");
const { pollMissions } = await import("./poller");
const { postSeatOutbox } = await import("./posting");
const { FakeGitHub } = await import("./fake-github.test.support");
const { manifestHash, readManifest } = await import("./protocol");

export const github = new FakeGitHub();

/** The manifest hash the Join dialog showed for PR `n`; a PR with no manifest gets one nothing matches. */
export const seen = (n: number): string => {
  const m = readManifest(github.pulls.get(n)?.body ?? "");
  return m ? manifestHash(m) : "0".repeat(64);
};

/** One device: its own database (its seats, its own-post log), a chat inbox, a busy switch. */
export function device(id: string, missionId: () => string) {
  const mem = new Database(":memory:");
  createSchema(mem);
  const inbox: Array<{ seat: string; text: string }> = [];
  const chat = { busy: false };
  const deps = {
    busy: () => chat.busy,
    runner: github.runner,
    device: () => id,
    send: async (s: MissionSeat, text: string) => { inbox.push({ seat: s.seat, text }); },
    // A real `git worktree add` leaves a folder; a roster pin to a missing folder is pruned on read.
    worktree: (_cwd: string, instanceId: string, branch: string) => {
      const basePath = join(projectsRoot, "proj", ".worktrees", instanceId);
      mkdirSync(basePath, { recursive: true });
      return { branch: `${branch}--${instanceId}`, basePath, createdAt: 1 };
    },
    git: () => ({ sha: "abc1234def", branch: "x", dirty: false }),
  };
  return {
    id, inbox, deps, chat,
    use() { globalThis.__agentOfficeDb = mem; },
    async poll() { this.use(); await pollMissions(deps); },
    take() { return inbox.splice(0); },
    seat(name: string) {
      this.use();
      const s = db.getMissionSeat(missionId(), name);
      assert.ok(s);
      return s;
    },
    async say(name: string, output: string, cost = 0.1) {
      const s = this.seat(name);
      await postSeatOutbox({ instanceId: s.instanceId, parentRunId: undefined, cost, output, status: "done" }, deps);
    },
  };
}
