/**
 * Boot-time side effects of an Agent Office server, embedded (Next's
 * instrumentation hook) or standalone (`main.ts`). Every step is idempotent and
 * isolated: one failing never stops the next, and none of them is something a
 * request depends on.
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
import { logEnvDiagnostics } from "./lib/env";

export interface BootOptions {
  /** False during `next build`: a build is not a server, so it neither advertises itself
   *  nor runs the loops (they would fire jobs whose `claude` dies with the build). */
  serve: boolean;
}

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

function seedStarterSkills(): void {
  try {
    const starterDir = resolveStarterDataDir();
    if (!starterDir) return;
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
    if (skills > 0) console.log(`[starter-bootstrap] seeded ${skills} skill(s)`);
  } catch (err) {
    console.warn("[starter-bootstrap] skipped:", err);
  }
}

export async function boot({ serve }: BootOptions): Promise<void> {
  // Env validation runs on module import (throws on malformed config).
  // This call surfaces missing-but-not-fatal warnings in the boot log.
  logEnvDiagnostics();
  seedStarterSkills();
  if (!serve) return;

  // Dynamic, not static: a static import of @agent-office/domain/services
  // (better-sqlite3 transitively) from Next's instrumentation graph breaks
  // Turbopack's standalone-build externals resolution (vercel/next.js#68805, #88844).
  let domainServices: typeof import("@agent-office/domain/services");
  try {
    domainServices = await import("@agent-office/domain/services");
  } catch (err) {
    console.warn("[domain-services] failed to load:", err);
    return;
  }
  const { projects, scheduler, settings, shellEnv, backgroundShellWatcher, discovery, db } = domainServices;

  // Out-of-process clients (the Minecraft mod) find this server's random port here.
  try {
    discovery.pruneDeadServers();
    discovery.writeDiscoveryFile();
    process.once("exit", () => {
      discovery.removeDiscoveryFile();
      db.releaseLoopLeases();
    });
  } catch (err) {
    console.warn("[discovery] failed to advertise this server:", err);
  }

  // Prime the terminal env mirror (~/.claude/agent-office/shell-env.sh) from
  // whatever project tab was active last session, so a shell opened before
  // the user touches a tab in the UI still gets the right account/secrets.
  try {
    shellEnv.writeActiveShellEnv(shellEnv.activeProjectIdFromTabs());
  } catch (err) {
    console.warn("[shell-env] failed to prime:", err);
  }

  // Removes orphan .worktrees/ directories for projects whose roster no longer
  // contains the instance. Only runs when the multiInstance flag is enabled.
  try {
    projects.reconcileAllWorktrees(settings.readSettings());
  } catch (err) {
    console.warn("[worktree-reconcile] skipped:", err);
  }

  // Rate-limit auto-resume + scheduled tasks. A no-op if a previous HMR worker
  // already started the loop.
  try {
    scheduler.startScheduler();
  } catch (err) {
    console.warn("[scheduler] failed to start:", err);
  }

  // Nudges an agent back into its conversation when a `run_in_background` Bash
  // shell it started exits after its turn already ended.
  try {
    backgroundShellWatcher.startBackgroundShellWatcher();
  } catch (err) {
    console.warn("[background-shell-watcher] failed to start:", err);
  }
}
