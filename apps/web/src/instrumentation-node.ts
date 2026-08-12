/**
 * Node-only side of the instrumentation hook. Imported dynamically
 * from instrumentation.ts under the nodejs runtime guard, so the edge
 * bundle never has to compile this file - the fs and os imports
 * below would fail there otherwise.
 *
 * Installs the bundled starter SKILLS into `~/.claude/agents/_skills/`
 * on a fresh machine. Agents are NOT auto-installed here - the
 * first-run wizard lets the user pick which of the bundled agents to
 * import, so seeding all 13 on boot would defeat that choice.
 *
 * Existing user data is never overwritten - subsequent restarts are
 * no-ops.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { projects, scheduler, settings } from "@agent-office/domain/services";
import { logEnvDiagnostics } from "./lib/env";

// Env validation runs on module import (throws on malformed config).
// This call surfaces missing-but-not-fatal warnings so the operator
// sees them in the boot log.
logEnvDiagnostics();

const SKILLS_DIR = join(homedir(), ".claude", "agents", "_skills");

function resolveStarterDataDir(): string | null {
  const candidates: string[] = [];
  if (process.env["AGENT_OFFICE_STARTER_DATA"]) {
    candidates.push(process.env["AGENT_OFFICE_STARTER_DATA"]!);
  }
  candidates.push(join(process.cwd(), "starter-data"));
  candidates.push(join(process.cwd(), "apps", "web", "starter-data"));
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isDirectory()) return c;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function hasSkillFolders(dir: string): boolean {
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).some(
      (name) => !name.startsWith("_") && isDir(join(dir, name)),
    );
  } catch {
    return false;
  }
}

try {
  const starterDir = resolveStarterDataDir();
  if (starterDir) {
    let skills = 0;
    const starterSkills = join(starterDir, "skills");
    if (existsSync(starterSkills) && !hasSkillFolders(SKILLS_DIR)) {
      mkdirSync(SKILLS_DIR, { recursive: true });
      for (const name of readdirSync(starterSkills)) {
        const from = join(starterSkills, name);
        if (!isDir(from)) continue;
        const to = join(SKILLS_DIR, name);
        if (existsSync(to)) continue;
        cpSync(from, to, { recursive: true });
        skills++;
      }
    }
    if (skills > 0) {
       
      console.log(`[starter-bootstrap] seeded ${skills} skill(s)`);
    }
  }
} catch (err) {
   
  console.warn("[starter-bootstrap] skipped:", err);
}

// Boot-time worktree reconciliation — removes orphan .worktrees/ directories
// for projects whose roster no longer contains the corresponding instance.
// Only runs when the multiInstance feature flag is enabled in settings.
try {
  projects.reconcileAllWorktrees(settings.readSettings());
} catch (err) {

  console.warn("[worktree-reconcile] skipped:", err);
}

// Start the server-side scheduler (rate-limit auto-resume + scheduled tasks).
// Idempotent — a no-op if a previous HMR worker already started the loop.
try {
  scheduler.startScheduler();
} catch (err) {

  console.warn("[scheduler] failed to start:", err);
}
