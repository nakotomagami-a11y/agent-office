/**
 * Boot-time side effects of an Agent Office server, embedded (Next's
 * instrumentation hook) or standalone (`main.ts`). Every step is idempotent and
 * isolated: one failing never stops the next, and none of them is something a
 * request depends on.
 *
 * Installs each bundled starter SKILL into `~/.claude/agents/_skills/`
 * the first time this install sees it. Agents are NOT auto-installed here - the
 * first-run wizard lets the user pick which of the bundled agents to
 * import, so seeding all 13 on boot would defeat that choice.
 *
 * Existing user data is never overwritten - restarts with no new bundled
 * skill are no-ops.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { logEnvDiagnostics } from "./lib/env";

export interface BootOptions {
  /** False during `next build`: a build is not a server, so it neither advertises itself
   *  nor runs the loops (they would fire jobs whose `claude` dies with the build). */
  serve: boolean;
  /** main.ts set AO_BASE_URL to the port it bound. Embedded in Next it is never ours. */
  ownBaseUrl?: boolean;
}

/**
 * A server started from an agent's shell inherits that agent's AO_BASE_URL, the PARENT server.
 * It outranks PORT, so every gateway run would send its requests and run token there, and every
 * permission callback too. Next sets PORT to the port it really bound.
 */
export function forgetInheritedBaseUrl(env: NodeJS.ProcessEnv, ownBaseUrl: boolean): void {
  if (!ownBaseUrl) delete env.AO_BASE_URL;
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

// Each bundled skill is offered once per install: one added to the bundle later
// still reaches machines seeded before it existed, and one the user uninstalls
// is not put back on the next boot. The settings "skill cache" cleanup drops the
// bundled skills it deleted from this marker (packages/domain/src/services/projects/cleanup.ts).
const SEEDED_FILE = "_seeded.json";
// The bundle as of the last fresh-machine-only seeding. An install with skill
// folders but no marker was already offered these, so they are not offered again.
const PRE_MARKER_BUNDLE = ["claude-api", "frontend-design", "web-artifacts-builder", "webapp-testing"];

function hasSkillFolders(dir: string): boolean {
  try {
    return readdirSync(dir).some((name) => !name.startsWith("_") && isDir(join(dir, name)));
  } catch {
    return false;
  }
}

function readSeeded(skillsDir: string): Set<string> | null {
  const file = join(skillsDir, SEEDED_FILE);
  if (!existsSync(file)) return null;
  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (Array.isArray(raw)) return new Set(raw.filter((n): n is string => typeof n === "string"));
    console.warn("[starter-bootstrap] _seeded.json is not a list; rebuilding it");
  } catch (err) {
    console.warn("[starter-bootstrap] unreadable _seeded.json; rebuilding it (uninstalled bundled skills may return):", err);
  }
  return null;
}

function writeSeeded(skillsDir: string, seeded: Set<string>): void {
  const file = join(skillsDir, SEEDED_FILE);
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify([...seeded].sort(), null, 2));
  renameSync(tmp, file);
}

// Via a staging dir, so a copy that dies halfway never looks installed. Never
// replaces an existing skill; returns whether it copied.
function copyIn(from: string, to: string, staging: string): boolean {
  if (existsSync(to)) return false;
  try {
    cpSync(from, staging, { recursive: true });
    renameSync(staging, to);
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    throw err;
  }
  return true;
}

export function seedStarterSkills(skillsDir: string = SKILLS_DIR, starterDirOverride?: string): void {
  try {
    const starterDir = starterDirOverride ?? resolveStarterDataDir();
    if (!starterDir) return;
    const starterSkills = join(starterDir, "skills");
    if (!existsSync(starterSkills)) return;
    mkdirSync(skillsDir, { recursive: true });
    const marker = readSeeded(skillsDir);
    const seeded = marker ?? new Set(hasSkillFolders(skillsDir) ? PRE_MARKER_BUNDLE : []);
    const before = seeded.size;
    let skills = 0;
    for (const name of readdirSync(starterSkills)) {
      const from = join(starterSkills, name);
      if (!isDir(from) || seeded.has(name)) continue;
      try {
        skills += copyIn(from, join(skillsDir, name), join(skillsDir, `_seeding-${name}-${process.pid}`)) ? 1 : 0;
        seeded.add(name);
      } catch (err) {
        console.warn(`[starter-bootstrap] could not seed ${name}; will retry next boot:`, err);
      }
    }
    if (!marker || seeded.size !== before) writeSeeded(skillsDir, seeded);
    if (skills > 0) console.log(`[starter-bootstrap] seeded ${skills} skill(s)`);
  } catch (err) {
    console.warn("[starter-bootstrap] skipped:", err);
  }
}

export async function boot({ serve, ownBaseUrl = false }: BootOptions): Promise<void> {
  forgetInheritedBaseUrl(process.env, ownBaseUrl);
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
  const { projects, scheduler, settings, shellEnv, backgroundShellWatcher, discovery, db, missions, providers } = domainServices;

  // Before any run reads the selection: an install from before providers keeps its subscription.
  // Pins older than the 6 h prompt-file prune belong to dead runs; the run cap is 4 h, and another
  // server sharing tmp-prompts may still hold younger ones.
  providers.migrateAtBoot();
  try {
    providers.sweepPinFiles(6 * 60 * 60_000);
  } catch (err) {
    console.warn("[providers] pin sweep failed:", err);
  }
  providers.startPriceRefresh();

  // Out-of-process clients (the Minecraft mod) find this server's random port here.
  try {
    discovery.pruneDeadServers();
    const advertised = discovery.writeDiscoveryFile();
    // The heartbeat other servers read: a stale entry means this server is gone (discovery.isLiveServer).
    setInterval(() => {
      try {
        discovery.writeDiscoveryFile(undefined, advertised);
      } catch (err) {
        console.warn("[discovery] heartbeat failed:", err);
      }
    }, discovery.HEARTBEAT_MS).unref();
    process.once("exit", () => {
      discovery.removeDiscoveryFile();
      // Only if the DB is already open: exit must not open it (and migrate) or wait on a lock.
      if (!globalThis.__agentOfficeDb) return;
      try {
        db.releaseLoopLeases();
      } catch (err) {
        console.warn("[loops] could not release leases on exit:", err);
      }
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
  // Routes hub comments into the mission seats this device holds (docs/missions.md).
  try {
    missions.startMissionPoller();
  } catch (err) {
    console.warn("[missions] failed to start:", err);
  }
}
