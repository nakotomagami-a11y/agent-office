// Portable project save-file bundle: a project and its roster agents. Domain-only,
// so both /api/save routes stay thin controllers.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as agents from "../agents/agents";
import * as projects from "./projects";
import { AGENTS_DIR, AGENT_BACKUPS_DIR, IMPORT_BACKUPS_DIR, isValidIdSegment } from "../infra/paths";
import { ensureDir, writeFileAtomic } from "../infra/fs-atomic";
import type { Project, ProjectMetaPatch } from "../../types";

export interface SaveBundleAgent { id: string; content: string; memory: string }

// Export produces the project's real, typed meta; import receives whatever the
// validated save file carried (a loose record), so the two directions differ.
export interface SaveBundle {
  version: 1;
  exportedAt: string;
  project: { id: string; meta: Project["meta"]; memory: string };
  agents: SaveBundleAgent[];
}

export interface ImportBundle {
  project: { id: string; meta: Record<string, unknown>; memory: string };
  agents: SaveBundleAgent[];
}

function collectUniqueRosterAgents(project: Project): SaveBundleAgent[] {
  const seen = new Set<string>();
  const out: SaveBundleAgent[] = [];
  for (const inst of project.meta.roster) {
    const id = inst.agentId;
    if (seen.has(id)) continue;
    seen.add(id);
    let content = "";
    try { content = readFileSync(join(AGENTS_DIR, `${id}.md`), "utf8"); } catch { /* missing */ }
    out.push({ id, content, memory: agents.readAgentMemory(id) });
  }
  return out;
}

/** Build a portable bundle for a project, or null if the project doesn't exist. */
export function exportBundle(projectId: string): SaveBundle | null {
  const project = projects.readProject(projectId);
  if (!project) return null;
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    project: { id: project.id, meta: project.meta, memory: project.memory },
    agents: collectUniqueRosterAgents(project),
  };
}

export interface ImportOutcome {
  projectId: string;
  agentCount: number;
  backedUp: string[];
  snapshot: string | null;
}

function backupIfChanged(path: string, next: string, name: string, at: string): boolean {
  if (!existsSync(path)) return false;
  const current = readFileSync(path, "utf8");
  if (!current || current === next) return false;
  ensureDir(AGENT_BACKUPS_DIR);
  writeFileAtomic(join(AGENT_BACKUPS_DIR, `${name}.import-${at}.md`), current);
  return true;
}

function restoreAgents(list: SaveBundleAgent[], at: string): string[] {
  ensureDir(AGENTS_DIR);
  const backedUp: string[] = [];
  for (const agent of list) {
    if (!agent.id || !isValidIdSegment(agent.id)) continue;
    let saved = false;
    if (agent.content) {
      const file = join(AGENTS_DIR, `${agent.id}.md`);
      saved = backupIfChanged(file, agent.content, agent.id, at);
      writeFileAtomic(file, agent.content);
    }
    // Empty means the exporting machine had no memory, not "erase this one's".
    if (agent.memory) {
      saved = backupIfChanged(agents.memoryPathFor(agent.id), agent.memory, `${agent.id}.memory`, at) || saved;
      agents.writeAgentMemory(agent.id, agent.memory);
    }
    if (saved) backedUp.push(agent.id);
  }
  return backedUp;
}

/** Another machine's checkout and worktrees: here they are missing, or someone else's folder. */
const MACHINE_KEYS = new Set(["cwd", "worktree", "worktreeMissing"]);

function portableSeat(seat: unknown): unknown {
  if (typeof seat !== "object" || seat === null) return seat;
  return Object.fromEntries(Object.entries(seat).filter(([k]) => !MACHINE_KEYS.has(k)));
}

function restoreProject(p: ImportBundle["project"]): void {
  const meta = p.meta;
  const str = (k: string): string | undefined =>
    typeof meta[k] === "string" ? (meta[k] as string) : undefined;
  const patch: ProjectMetaPatch = {
    name: str("name"),
    description: str("description"),
    accountId: str("accountId"),
    githubAccountId: str("githubAccountId"),
    shelved: typeof meta.shelved === "boolean" ? meta.shelved : undefined,
    // arch.parse-dont-cast: bundle contents are untrusted input.
    planet: projects.parsePlanetConfig(meta.planet),
  };
  const existing = projects.readProject(p.id);
  if (!existing) {
    projects.createProject({
      id: p.id,
      name: patch.name ?? p.id,
      description: patch.description ?? "",
    });
  }
  projects.updateProject(p.id, { meta: patch, memory: p.memory || undefined }, "importBundle");
  // Unconditional would let a roster-less bundle delete every instance.
  if (!Array.isArray(meta.roster)) return;
  // Added to, never replaced: replacing orphaned the existing seats' worktrees and chats.
  projects.addToRoster(p.id, meta.roster.map(portableSeat), "importBundle");
}

function snapshotBefore(projectId: string, at: string): string | null {
  const before = exportBundle(projectId);
  if (!before) return null;
  ensureDir(IMPORT_BACKUPS_DIR);
  const file = join(IMPORT_BACKUPS_DIR, `${projectId}.${at}.agent-office.json`);
  writeFileAtomic(file, JSON.stringify(before, null, 2));
  return file;
}

/** Restore a validated bundle; whatever it replaces is saved under BACKUPS_DIR first. */
export function importBundle(bundle: ImportBundle): ImportOutcome {
  const at = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshot = snapshotBefore(bundle.project.id, at);
  const backedUp = restoreAgents(bundle.agents, at);
  restoreProject(bundle.project);
  return { projectId: bundle.project.id, agentCount: bundle.agents.length, backedUp, snapshot };
}
