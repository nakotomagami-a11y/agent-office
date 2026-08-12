// Projects - scanned from the user's projectsRoot.
// Per-project metadata in ~/.claude/projects/<id>/project.md (YAML frontmatter + memory body).
// Rosters of agent instances live in that frontmatter.

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, sep } from "node:path";
import type { AgentInstance, AppSettings, PlanetConfig, PlanetType, Project, ProjectMeta, ProjectSummary, ScannedEntry } from "../types/index";
import { expandTilde, PROJECTS_DIR } from "./paths";
import { ensureDir, writeFileAtomic } from "./fs-atomic";
import { isYamlMapping, parseYaml, stringifyYaml, type YamlMapping, type YamlValue } from "./yaml";
import { log } from "./log";
import { readSettings, scanProjects, slugify, isFeatureEnabled } from "./settings";
import { getDb } from "./db";
import {
  isGitRepo,
  createWorktree,
  removeWorktree,
  reconcileWorktrees,
  worktreePath,
  worktreeDirExists,
  ensureWorktree,
} from "./worktrees";

function metadataFile(id: string): string {
  return join(PROJECTS_DIR, id, "project.md");
}

interface ParsedMetadata { meta: Partial<ProjectMeta>; memory: string }

function parseMetadataFile(content: string): ParsedMetadata {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, memory: content.trim() };
  let raw: YamlMapping = {};
  try {
    const parsed = parseYaml(m[1]!);
    if (isYamlMapping(parsed)) raw = parsed;
  } catch {
    raw = {};
  }
  return { meta: yamlToProjectMeta(raw), memory: (m[2] ?? "").trim() };
}

const PLANET_TYPES = new Set<PlanetType>(["gas-giant", "rocky", "dry", "terran", "ice", "islands", "lava", "black-hole", "galaxy", "star", "asteroid"]);

function parsePlanetConfig(raw: unknown): PlanetConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const type = o.type as string;
  if (!PLANET_TYPES.has(type as PlanetType)) return undefined;
  const seed = typeof o.seed === "number" ? o.seed : undefined;
  const paletteIdx = typeof o.paletteIdx === "number" ? o.paletteIdx : 0;
  if (seed === undefined) return undefined;
  const out: PlanetConfig = { type: type as PlanetType, seed, paletteIdx };
  if (typeof o.pixels === "number") out.pixels = Math.round(o.pixels);
  if (typeof o.rotation === "number") out.rotation = o.rotation;
  if (typeof o.dither === "boolean") out.dither = o.dither;
  if (Array.isArray(o.customPalette)) {
    const cp = (o.customPalette as unknown[]).map((layer) => {
      if (!Array.isArray(layer)) return null;
      return (layer as unknown[]).map((c) => {
        if (!Array.isArray(c) || c.length !== 3) return null;
        const [r, g, b] = c as unknown[];
        if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number") return null;
        return [r, g, b] as [number, number, number];
      }).filter((c): c is [number, number, number] => c !== null);
    }).filter((l): l is [number, number, number][] => l !== null);
    if (cp.length > 0) out.customPalette = cp;
  }
  return out;
}

function yamlToProjectMeta(m: YamlMapping): Partial<ProjectMeta> {
  const out: Partial<ProjectMeta> = {};
  if (typeof m.name === "string") out.name = m.name;
  if (typeof m.description === "string") out.description = m.description;
  if (Array.isArray(m.roster)) out.roster = normalizeRoster(m.roster);
  const planet = parsePlanetConfig(m.planet);
  if (planet) out.planet = planet;
  if (typeof m.accountId === "string" && m.accountId.trim()) out.accountId = m.accountId.trim();
  if (typeof m.githubAccountId === "string" && m.githubAccountId.trim()) out.githubAccountId = m.githubAccountId.trim();
  if (typeof m.shelved === "boolean") out.shelved = m.shelved;
  return out;
}

function rosterToYaml(roster: AgentInstance[]): YamlValue {
  return roster.map((inst) => {
    const o: YamlMapping = { instanceId: inst.instanceId, agentId: inst.agentId };
    if (inst.label !== undefined) o.label = inst.label;
    if (inst.model !== undefined) o.model = inst.model;
    if (inst.effort !== undefined) o.effort = inst.effort;
    if (inst.permissionMode !== undefined) o.permissionMode = inst.permissionMode;
    if (inst.room !== undefined) o.room = inst.room;
    if (inst.cwd !== undefined) o.cwd = inst.cwd;
    if (inst.worktree !== undefined) {
      o.worktree = {
        branch: inst.worktree.branch,
        basePath: inst.worktree.basePath,
        createdAt: inst.worktree.createdAt,
      } as unknown as YamlValue;
    }
    return o;
  });
}

function readMetadata(id: string): ParsedMetadata | null {
  const path = metadataFile(id);
  if (!existsSync(path)) return null;
  try {
    return parseMetadataFile(readFileSync(path, "utf8"));
  } catch (e) {
    log.warn("project.metadata_parse_failed", { id, err: String(e) });
    return null;
  }
}

function normalizeRoster(raw: unknown): AgentInstance[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentInstance[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.instanceId !== "string" || typeof o.agentId !== "string") continue;
    if (seen.has(o.instanceId)) continue;
    seen.add(o.instanceId);
    const inst: AgentInstance = { instanceId: o.instanceId, agentId: o.agentId };
    if (typeof o.label === "string") inst.label = o.label;
    if (typeof o.model === "string") inst.model = o.model;
    if (typeof o.effort === "string") inst.effort = o.effort;
    if (typeof o.permissionMode === "string") inst.permissionMode = o.permissionMode;
    if (typeof o.room === "string") inst.room = o.room;
    if (typeof o.cwd === "string") inst.cwd = o.cwd;
    if (o.worktree && typeof o.worktree === "object") {
      const wt = o.worktree as Record<string, unknown>;
      if (
        typeof wt.branch === "string" &&
        typeof wt.basePath === "string" &&
        typeof wt.createdAt === "number"
      ) {
        inst.worktree = {
          branch: wt.branch,
          basePath: wt.basePath,
          createdAt: wt.createdAt,
        };
      }
    }
    out.push(inst);
  }
  return out;
}

function writeMetadata(id: string, meta: Partial<ProjectMeta>, memory: string): void {
  ensureDir(PROJECTS_DIR);
  ensureDir(join(PROJECTS_DIR, id));
  const fmObj: YamlMapping = {};
  if (meta.name) fmObj.name = meta.name;
  if (meta.description) fmObj.description = meta.description;
  if (Array.isArray(meta.roster) && meta.roster.length > 0) {
    fmObj.roster = rosterToYaml(meta.roster);
  }
  if (meta.accountId) fmObj.accountId = meta.accountId;
  if (meta.githubAccountId) fmObj.githubAccountId = meta.githubAccountId;
  if (meta.shelved) fmObj.shelved = true;
  if (meta.planet) {
    const p = meta.planet;
    const pObj: Record<string, unknown> = { type: p.type, seed: p.seed, paletteIdx: p.paletteIdx };
    if (p.pixels !== undefined) pObj.pixels = p.pixels;
    if (p.rotation !== undefined) pObj.rotation = p.rotation;
    if (p.dither !== undefined) pObj.dither = p.dither;
    fmObj.planet = pObj as unknown as YamlValue;
  }
  const fmStr = Object.keys(fmObj).length === 0 ? "" : stringifyYaml(fmObj).trim();
  const body = memory.trim();
  let content = "";
  if (fmStr) content += `---\n${fmStr}\n---\n\n`;
  if (body) content += `${body}\n`;
  writeFileAtomic(metadataFile(id), content);
}

function projectFromScan(entry: ScannedEntry): Project {
  const md = readMetadata(entry.id);
  const meta: ProjectMeta = {
    name: md?.meta.name ?? entry.name,
    description: md?.meta.description ?? "",
    cwd: entry.fullPath,
    roster: normalizeRoster(md?.meta.roster),
  };
  if (md?.meta.planet) meta.planet = md.meta.planet;
  if (md?.meta.accountId) meta.accountId = md.meta.accountId;
  if (md?.meta.githubAccountId) meta.githubAccountId = md.meta.githubAccountId;
  if (md?.meta.shelved) meta.shelved = true;
  return { id: entry.id, meta, memory: md?.memory ?? "" };
}

export function listProjectSummaries(): ProjectSummary[] {
  const settings = readSettings();
  if (!settings) return [];

  const lastRuns = new Map<string, number>();
  try {
    const rows = getDb()
      .prepare("SELECT project_id, MAX(started_at) as last_run FROM runs WHERE project_id IS NOT NULL GROUP BY project_id")
      .all() as { project_id: string; last_run: number }[];
    for (const row of rows) lastRuns.set(row.project_id, row.last_run);
  } catch { /* db not ready */ }

  return scanProjects(settings.projectsRoot, settings.excluded)
    .map((entry) => {
      const p = projectFromScan(entry);
      return {
        id: p.id,
        name: p.meta.name,
        description: p.meta.description,
        cwd: p.meta.cwd,
        instanceCount: p.meta.roster.length,
        lastRunAt: lastRuns.get(p.id),
        planet: p.meta.planet,
        shelved: p.meta.shelved ?? false,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readProject(id: string): Project | null {
  const settings = readSettings();
  if (!settings) return null;
  const scanned = scanProjects(settings.projectsRoot, settings.excluded).find((e) => e.id === id);
  if (!scanned) return null;
  return projectFromScan(scanned);
}

export function updateProject(
  id: string,
  patch: { meta?: Partial<ProjectMeta>; memory?: string },
): Project {
  const existing = readProject(id);
  if (!existing) throw new Error(`project '${id}' not found`);
  const meta: ProjectMeta = { ...existing.meta, ...patch.meta };
  if (patch.meta?.roster !== undefined) {
    meta.roster = normalizeRoster(patch.meta.roster);
  }
  const memory = patch.memory ?? existing.memory;
  writeMetadata(id, meta, memory);
  return { id, meta, memory };
}

export function deleteProject(id: string): boolean {
  const dir = join(PROJECTS_DIR, id);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  log.info("project.metadata_deleted", { id });
  return true;
}

/**
 * Generate an instance id that's never been used in this roster *and*
 * also includes a short timestamp/random suffix so re-adding the same
 * agent after a remove yields a fresh id - that's how chat transcripts
 * key off the instance, so collisions would carry old conversations
 * into a new "colleague".
 */
function makeInstanceId(agentId: string, existing: AgentInstance[]): string {
  const taken = new Set(existing.map((i) => i.instanceId));
  const suffix = () =>
    Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5);
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `${agentId}-${suffix()}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${agentId}-${Date.now()}`;
}

export class InstanceCapError extends Error {
  readonly code = "INSTANCE_CAP_EXCEEDED" as const;
  readonly softCap: boolean;
  readonly count: number;
  constructor(opts: { softCap: boolean; count: number }) {
    super(`Instance cap exceeded (softCap=${opts.softCap}, count=${opts.count})`);
    this.name = "InstanceCapError";
    this.softCap = opts.softCap;
    this.count = opts.count;
  }
}

export function addInstance(
  projectId: string,
  agentId: string,
  init?: Partial<Omit<AgentInstance, "instanceId" | "agentId">>,
  settings?: AppSettings | null,
  force?: boolean,
): { project: Project; instance: AgentInstance } {
  const p = readProject(projectId);
  if (!p) throw new Error(`project '${projectId}' not found`);

  const existingCount = p.meta.roster.filter((i) => i.agentId === agentId).length;

  if (existingCount >= 10) {
    // Hard cap — always enforced regardless of force flag.
    throw new InstanceCapError({ softCap: false, count: existingCount });
  }
  if (existingCount >= 5 && !force) {
    // Soft cap — skipped when force is true.
    throw new InstanceCapError({ softCap: true, count: existingCount });
  }

  const instanceId = makeInstanceId(agentId, p.meta.roster);
  const instance: AgentInstance = { instanceId, agentId, ...init };

  // Worktree creation for 2nd+ instance of the same agent, when flag is on.
  if (
    existingCount >= 1 &&
    isFeatureEnabled(settings ?? null, "multiInstance") &&
    p.meta.cwd &&
    isGitRepo(p.meta.cwd)
  ) {
    try {
      const wt = createWorktree(p.meta.cwd, agentId, instanceId);
      instance.worktree = wt;
      instance.cwd = wt.basePath;
    } catch (err) {
      log.warn("project.worktree_create_failed", {
        projectId,
        instanceId,
        agentId,
        err: err instanceof Error ? err.message : String(err),
      });
      // Graceful fallback: instance shares project cwd, worktree/cwd remain unset.
    }
  } else if (existingCount >= 1 && !isGitRepo(p.meta.cwd ?? "")) {
    log.info("project.instance_shared_cwd", {
      projectId,
      instanceId,
      agentId,
      note: "project is not a git repo — instance shares project cwd",
    });
  }

  const meta: ProjectMeta = { ...p.meta, roster: [...p.meta.roster, instance] };
  writeMetadata(projectId, meta, p.memory);
  log.info("project.instance_added", { projectId, instanceId: instance.instanceId, agentId });
  return { project: { id: projectId, meta, memory: p.memory }, instance };
}

export function patchInstance(
  projectId: string,
  instanceId: string,
  patch: Partial<Omit<AgentInstance, "instanceId" | "agentId">>,
): Project {
  const p = readProject(projectId);
  if (!p) throw new Error(`project '${projectId}' not found`);
  const idx = p.meta.roster.findIndex((i) => i.instanceId === instanceId);
  if (idx === -1) throw new Error(`instance '${instanceId}' not found`);
  const updated: AgentInstance = { ...p.meta.roster[idx]!, ...patch };
  for (const k of ["label", "model", "effort", "permissionMode", "room"] as const) {
    if (k in patch && patch[k] === "") delete updated[k];
  }
  const roster = [...p.meta.roster];
  roster[idx] = updated;
  const meta = { ...p.meta, roster };
  writeMetadata(projectId, meta, p.memory);
  log.info("project.instance_patched", { projectId, instanceId });
  return { id: projectId, meta, memory: p.memory };
}

export function removeInstance(projectId: string, instanceId: string): Project {
  const p = readProject(projectId);
  if (!p) throw new Error(`project '${projectId}' not found`);
  const instance = p.meta.roster.find((i) => i.instanceId === instanceId);
  const roster = p.meta.roster.filter((i) => i.instanceId !== instanceId);
  if (roster.length === p.meta.roster.length) {
    throw new Error(`instance '${instanceId}' not found`);
  }

  // Clean up worktree before removing from roster.
  if (instance?.worktree && p.meta.cwd) {
    try {
      removeWorktree(p.meta.cwd, instance.worktree);
    } catch (err) {
      log.warn("project.worktree_remove_failed", {
        projectId,
        instanceId,
        err: err instanceof Error ? err.message : String(err),
      });
      // Do not fail the remove — roster entry is still removed below.
    }
  }

  const meta = { ...p.meta, roster };
  writeMetadata(projectId, meta, p.memory);
  // Transcript rows (runs, messages, tool_calls) are archived, not deleted.
  log.info("project.instance_removed", { projectId, instanceId });
  return { id: projectId, meta, memory: p.memory };
}

/**
 * Boot-time reconciliation: remove orphan worktree directories for all projects.
 * Only runs when the multiInstance feature flag is enabled.
 */
export function reconcileAllWorktrees(settings: AppSettings | null): void {
  if (!isFeatureEnabled(settings, "multiInstance")) return;

  const currentSettings = settings ?? readSettings();
  if (!currentSettings) return;

  const entries = scanProjects(currentSettings.projectsRoot, currentSettings.excluded);

  for (const entry of entries) {
    const cwd = entry.fullPath;
    if (!isGitRepo(cwd)) continue;

    const md = readMetadata(entry.id);
    const roster = normalizeRoster(md?.meta.roster);
    const rosterInstanceIds = new Set(roster.map((i) => i.instanceId));

    try {
      // Direction 1: remove worktree directories with no roster entry.
      reconcileWorktrees(cwd, rosterInstanceIds);

      // Direction 2: heal roster entries whose worktree directory is missing —
      // recreate when possible, otherwise clear the dead pin so the instance
      // falls back to the shared project cwd instead of bricking on next run.
      const project = readProject(entry.id);
      if (project) {
        for (const instance of project.meta.roster) {
          if (!hasWorktreeIntent(instance)) continue;
          if (worktreeDirExists(cwd, instance.instanceId)) continue;
          resolveInstanceCwd(project, instance);
        }
      }
    } catch (err) {
      log.warn("reconcile.project_failed", {
        projectId: entry.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info("reconcile.done", { projectsChecked: entries.length });
}

export function findInstance(project: Project | null, instanceId: string | undefined): AgentInstance | null {
  if (!project || !instanceId) return null;
  return project.meta.roster.find((i) => i.instanceId === instanceId) ?? null;
}

export function readProjectMemory(id: string): string {
  return readProject(id)?.memory ?? "";
}

export function resolveSummonCwd(
  requested: string | undefined,
  project: Project | null,
): string | undefined {
  const r = requested?.trim();
  if (r) return r;
  return project?.meta.cwd?.trim() || undefined;
}

const WORKTREE_PIN = `${sep}.worktrees${sep}`;

/** True when the instance is meant to run in its own git worktree. */
function hasWorktreeIntent(instance: AgentInstance): boolean {
  return !!instance.worktree || (!!instance.cwd && instance.cwd.includes(WORKTREE_PIN));
}

/** Remove a dead worktree pin from the roster so the instance falls back to the shared cwd. */
function clearStaleWorktree(projectId: string, instanceId: string): void {
  const p = readProject(projectId);
  if (!p) return;
  const idx = p.meta.roster.findIndex((i) => i.instanceId === instanceId);
  if (idx === -1) return;
  const inst = { ...p.meta.roster[idx]! };
  if (inst.cwd === undefined && inst.worktree === undefined) return;
  delete inst.cwd;
  delete inst.worktree;
  const roster = [...p.meta.roster];
  roster[idx] = inst;
  writeMetadata(projectId, { ...p.meta, roster }, p.memory);
  log.info("project.worktree_pin_cleared", { projectId, instanceId });
}

/**
 * True when the instance is pinned to a git worktree whose directory is missing
 * on disk. Used to surface a "needs repair" badge in the UI. Read-only — does
 * not mutate the roster.
 */
export function instanceWorktreeMissing(project: Project | null, instance: AgentInstance): boolean {
  if (!project || !hasWorktreeIntent(instance)) return false;
  const projectCwd = project.meta.cwd;
  if (!projectCwd) return true;
  return !worktreeDirExists(projectCwd, instance.instanceId);
}

/**
 * Resolve the working directory for a run, self-healing a missing worktree.
 *
 * For worktree-backed instances:
 *  - returns the worktree path when it exists (correcting a drifted absolute
 *    path, e.g. after the repo was moved);
 *  - otherwise recreates the worktree (reusing the original branch when
 *    possible) and persists the corrected pin;
 *  - if recreation is impossible, clears the dead pin and returns undefined so
 *    the agent degrades to the shared project cwd instead of erroring.
 *
 * Returns the absolute cwd, or undefined to defer to resolveSummonCwd.
 */
export function resolveInstanceCwd(
  project: Project | null,
  instance: AgentInstance | null,
): string | undefined {
  if (!project || !instance) return undefined;
  if (!hasWorktreeIntent(instance)) return instance.cwd?.trim() || undefined;

  const projectCwd = project.meta.cwd;
  if (!projectCwd || !isGitRepo(projectCwd)) {
    clearStaleWorktree(project.id, instance.instanceId);
    return undefined;
  }

  const expected = worktreePath(projectCwd, instance.instanceId);

  if (worktreeDirExists(projectCwd, instance.instanceId)) {
    if (instance.cwd !== expected) {
      patchInstance(project.id, instance.instanceId, {
        cwd: expected,
        ...(instance.worktree ? { worktree: { ...instance.worktree, basePath: expected } } : {}),
      });
    }
    return expected;
  }

  const recreated = ensureWorktree(projectCwd, instance.instanceId, instance.worktree?.branch);
  if (recreated) {
    patchInstance(project.id, instance.instanceId, {
      cwd: recreated.basePath,
      worktree: {
        branch: recreated.branch || instance.worktree?.branch || "",
        basePath: recreated.basePath,
        createdAt: instance.worktree?.createdAt ?? recreated.createdAt,
      },
    });
    log.info("project.worktree_healed", {
      projectId: project.id,
      instanceId: instance.instanceId,
      branch: recreated.branch,
    });
    return recreated.basePath;
  }

  clearStaleWorktree(project.id, instance.instanceId);
  log.warn("project.worktree_unhealable", { projectId: project.id, instanceId: instance.instanceId });
  return undefined;
}

export interface CreateProjectInput {
  id?: string;
  name?: string;
  description?: string;
  roster?: unknown[];
  planet?: PlanetConfig;
}

const PLANET_TYPE_PALETTE_COUNTS: Record<PlanetType, number> = {
  "gas-giant": 6,
  "rocky": 5,
  "dry": 5,
  "terran": 5,
  "ice": 5,
  "islands": 5,
  "lava": 5,
  "black-hole": 5,
  "galaxy": 5,
  "star": 5,
  "asteroid": 5,
};

function autoRandomPlanet(): PlanetConfig {
  const types: PlanetType[] = ["gas-giant", "rocky", "dry", "terran", "ice", "islands", "lava", "black-hole", "galaxy", "star", "asteroid"];
  const type = types[Math.floor(Math.random() * types.length)]!;
  const paletteCount = PLANET_TYPE_PALETTE_COUNTS[type];
  return {
    type,
    seed: Math.floor(Math.random() * 999999999),
    paletteIdx: Math.floor(Math.random() * paletteCount),
    pixels: 1000,
    dither: true,
  };
}

export function createProject(input: CreateProjectInput): Project {
  const settings = readSettings();
  if (!settings) throw new Error("first-run setup not complete");
  const id = input.id?.trim() || slugify(input.name ?? "");
  if (!id) throw new Error("id or name required");
  let scanned = scanProjects(settings.projectsRoot, settings.excluded).find((e) => e.id === id);
  if (!scanned) {
    const newPath = join(expandTilde(settings.projectsRoot), id);
    mkdirSync(newPath, { recursive: true });
    log.info("project.folder_created", { path: newPath });
    scanned = scanProjects(settings.projectsRoot, settings.excluded).find((e) => e.id === id);
    if (!scanned) throw new Error(`failed to create project folder at ${newPath}`);
  }
  const meta: ProjectMeta = {
    name: input.name ?? scanned.name,
    description: input.description ?? "",
    cwd: scanned.fullPath,
    roster: normalizeRoster(input.roster),
    planet: input.planet ?? autoRandomPlanet(),
  };
  writeMetadata(id, meta, "");
  log.info("project.metadata_created", { id });
  return { id, meta, memory: "" };
}
