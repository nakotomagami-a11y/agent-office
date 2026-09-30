// Projects - scanned from the user's projectsRoot.
// Per-project metadata in ~/.claude/projects/<id>/project.md (YAML frontmatter + memory body).
// Rosters of agent instances live in that frontmatter.

import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, sep } from "node:path";
import type { AgentInstance, AppSettings, PlanetConfig, PlanetType, Project, ProjectMeta, ProjectMetaPatch, ProjectSummary, ScannedEntry } from "../../types/index";
import { expandTilde, PROJECTS_DIR } from "../infra/paths";
import { ensureDir, writeFileAtomic } from "../infra/fs-atomic";
import { parseFrontmatterDetailed, stringifyYaml, type YamlMapping, type YamlValue } from "../infra/yaml";
import { log } from "../infra/log";
import { readSettings, scanProjects, slugify, isFeatureEnabled } from "../settings";
import { getDb } from "../db";
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

interface ParsedMetadata {
  meta: Partial<ProjectMeta>;
  memory: string;
  rev: string;
  /** Raw frontmatter, so keys this module does not model survive a write. */
  raw: YamlMapping;
  /** `---` block present but yielding no mapping: unreadable, not empty. */
  lossy: boolean;
}

/** Rev of a project that has no `project.md` on disk yet. */
export const EMPTY_REV = "empty";

/** Write token. Content-hashed, not mtime: mtime granularity varies by fs. */
function revOf(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

/** Raised when project.md exists but could not be understood. */
export class UnreadableProjectMetadataError extends Error {
  readonly code = "metadata_unreadable";
  constructor(readonly projectId: string) {
    super(`project '${projectId}' metadata is present but unreadable -- refusing to overwrite it`);
    this.name = "UnreadableProjectMetadataError";
  }
}

/** Raised when a write's `expectedRev` no longer matches what is on disk. */
export class StaleProjectWriteError extends Error {
  readonly code = "stale_write";
  constructor(readonly projectId: string, readonly expectedRev: string, readonly actualRev: string) {
    super(
      `project '${projectId}' changed on disk since it was read ` +
      `(expected rev ${expectedRev}, found ${actualRev}) -- refusing to overwrite`,
    );
    this.name = "StaleProjectWriteError";
  }
}

/**
 * Shared CRLF-tolerant splitter. A hand-rolled `/^---\n/` copy lived here and
 * matched nothing on CRLF, so one write emptied the whole project.
 */
function parseMetadataFile(content: string): ParsedMetadata {
  const { fm, body, matched, mapping } = parseFrontmatterDetailed(content);
  return {
    meta: yamlToProjectMeta(fm),
    memory: body.trim(),
    rev: revOf(content),
    raw: fm,
    // Keying on "no keys" locked users out of an empty block, a comment-only
    // block, and a stray `---` markdown rule.
    lossy: matched && !mapping,
  };
}

const PLANET_TYPES = new Set<PlanetType>(["gas-giant", "rocky", "terran", "ringed-terran", "toxic", "ice", "islands", "lava", "ice-moon", "eclipse", "black-hole", "galaxy", "star", "asteroid", "comet"]);

export function parsePlanetConfig(raw: unknown): PlanetConfig | undefined {
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
  if (o.params && typeof o.params === "object" && !Array.isArray(o.params)) {
    const params: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.params as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) params[k] = v;
    }
    if (Object.keys(params).length > 0) out.params = params;
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

/** Per-instance keys this module models; anything else is carried through. */
const KNOWN_INSTANCE_KEYS = new Set([
  "instanceId", "agentId", "label", "model", "effort",
  "permissionMode", "playwrightEnabled", "room", "cwd", "worktree",
]);

/** Re-emits unmodelled per-instance keys, as `carry` does for top-level ones. */
function rosterToYaml(roster: AgentInstance[], carried?: unknown): YamlValue {
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of Array.isArray(carried) ? carried : []) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.instanceId === "string") byId.set(o.instanceId, o);
  }
  return roster.map((inst) => {
    const o: YamlMapping = {};
    for (const [k, v] of Object.entries(byId.get(inst.instanceId) ?? {})) {
      if (!KNOWN_INSTANCE_KEYS.has(k)) o[k] = v as YamlValue;
    }
    o.instanceId = inst.instanceId;
    o.agentId = inst.agentId;
    if (inst.label !== undefined) o.label = inst.label;
    if (inst.model !== undefined) o.model = inst.model;
    if (inst.effort !== undefined) o.effort = inst.effort;
    if (inst.permissionMode !== undefined) o.permissionMode = inst.permissionMode;
    if (inst.playwrightEnabled !== undefined) o.playwrightEnabled = inst.playwrightEnabled;
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

/**
 * Parsed project.md keyed by path, invalidated by mtime — the 10s summary poll
 * would otherwise re-parse every project's YAML each tick. `null` mtime is a
 * negative entry (file absent).
 */
const metadataCache = new Map<string, { mtimeMs: number | null; parsed: ParsedMetadata | null }>();

function readMetadata(id: string): ParsedMetadata | null {
  const path = metadataFile(id);

  let mtimeMs: number | null;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    mtimeMs = null; // absent (ENOENT) or unreadable — treated as "no metadata"
  }

  const cached = metadataCache.get(path);
  if (cached && cached.mtimeMs === mtimeMs) return cached.parsed;

  if (mtimeMs === null) {
    metadataCache.set(path, { mtimeMs: null, parsed: null });
    return null;
  }

  let parsed: ParsedMetadata | null;
  try {
    parsed = parseMetadataFile(readFileSync(path, "utf8"));
  } catch (e) {
    // Exists but unreadable. null would look like "absent", report EMPTY_REV
    // and let a write blow it away.
    log.error("project.metadata_read_failed", { id, err: String(e) });
    parsed = { meta: {}, memory: "", rev: EMPTY_REV, raw: {}, lossy: true };
  }
  metadataCache.set(path, { mtimeMs, parsed });
  return parsed;
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
    if (typeof o.playwrightEnabled === "boolean") inst.playwrightEnabled = o.playwrightEnabled;
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
  if (out.length < raw.length) {
    // A dropped entry is an instance vanishing from the office. It stays
    // dropped (unusable shape), but silence is what made the original
    // roster loss unattributable.
    log.warn("project.roster_entries_discarded", { seen: raw.length, kept: out.length });
  }
  return out;
}

/**
 * Frontmatter keys this module owns; anything else is carried through.
 * `satisfies Record<keyof ProjectMeta, true>` pins it to the type: add a field
 * to ProjectMeta and forget this set, and the compiler complains instead of
 * silently resurrecting a cleared value out of `carry` on the next write.
 */
const KNOWN_META_KEYS = new Set(Object.keys({
  name: true, description: true, cwd: true, roster: true,
  accountId: true, githubAccountId: true, shelved: true, planet: true,
} satisfies Record<keyof ProjectMeta, true>));

/** `carry` re-emits frontmatter keys this module does not model. */
function serializeMetadata(meta: Partial<ProjectMeta>, memory: string, carry: YamlMapping = {}): string {
  const fmObj: YamlMapping = {};
  for (const [k, v] of Object.entries(carry)) {
    if (!KNOWN_META_KEYS.has(k)) fmObj[k] = v;
  }
  if (meta.name) fmObj.name = meta.name;
  if (meta.description) fmObj.description = meta.description;
  if (Array.isArray(meta.roster) && meta.roster.length > 0) {
    fmObj.roster = rosterToYaml(meta.roster, carry.roster);
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
    if (p.params && Object.keys(p.params).length > 0) pObj.params = p.params as unknown as YamlValue;
    // Parsed and user-authored, so it must round-trip.
    if (p.customPalette && p.customPalette.length > 0) {
      pObj.customPalette = p.customPalette as unknown as YamlValue;
    }
    fmObj.planet = pObj as unknown as YamlValue;
  }
  const fmStr = Object.keys(fmObj).length === 0 ? "" : stringifyYaml(fmObj).trim();
  const body = memory.trim();
  let content = "";
  if (fmStr) content += `---\n${fmStr}\n---\n\n`;
  if (body) content += `${body}\n`;
  return content;
}

/**
 * The ONLY writer. `reason` makes a lost field one grep away; the absence of
 * such a trail is why the 2026-09-30 roster loss was never attributed.
 */
function writeMetadata(
  id: string,
  meta: Partial<ProjectMeta>,
  memory: string,
  reason: string,
  carry: YamlMapping = {},
): string {
  ensureDir(PROJECTS_DIR);
  ensureDir(join(PROJECTS_DIR, id));
  const content = serializeMetadata(meta, memory, carry);
  const path = metadataFile(id);
  writeFileAtomic(path, content);
  metadataCache.delete(path);
  const rev = revOf(content);
  log.info("project.metadata_written", {
    id,
    reason,
    rev,
    rosterCount: Array.isArray(meta.roster) ? meta.roster.length : 0,
    accountId: meta.accountId ?? null,
  });
  return rev;
}

interface MetadataSnapshot { meta: ProjectMeta; memory: string; rev: string }

/**
 * `apply` receives ON-DISK state, so a caller cannot write back a blob it
 * captured earlier. `expectedRev` covers the cross-process case.
 */
function mutateMetadata(
  id: string,
  reason: string,
  apply: (current: MetadataSnapshot) => { meta: ProjectMeta; memory?: string },
  expectedRev?: string,
): Project {
  // Uncached: same-millisecond writes share an mtimeMs, so a cached parse can
  // hide an edit and defeat the expectedRev check below.
  metadataCache.delete(metadataFile(id));
  const md = readMetadata(id);
  const existing = readProject(id);
  if (!existing) throw new Error(`project '${id}' not found`);
  // The merge base would be empty, and the rev check would pass anyway
  // (the rev hashes raw bytes, which read fine).
  if (md?.lossy) {
    log.error("project.metadata_unreadable", { id, reason });
    throw new UnreadableProjectMetadataError(id);
  }
  const currentRev = existing.rev ?? EMPTY_REV;
  if (expectedRev !== undefined && expectedRev !== currentRev) {
    log.warn("project.stale_write_rejected", { id, reason, expectedRev, actualRev: currentRev });
    throw new StaleProjectWriteError(id, expectedRev, currentRev);
  }
  const next = apply({ meta: existing.meta, memory: existing.memory, rev: currentRev });
  const memory = next.memory ?? existing.memory;
  const rev = writeMetadata(id, next.meta, memory, reason, md?.raw ?? {});
  return { id, meta: next.meta, memory, rev };
}

function projectFromScan(entry: ScannedEntry): Project {
  const md = readMetadata(entry.id);
  const meta: ProjectMeta = {
    name: md?.meta.name ?? entry.name,
    description: md?.meta.description ?? "",
    cwd: entry.fullPath,
    roster: normalizeRoster(md?.meta.roster),
  };
  // Every project must carry a planet. Persisted config wins; otherwise fall
  // back to a deterministic high-quality planet derived from the id, never
  // the low-res procedural placeholder.
  meta.planet = md?.meta.planet ?? defaultPlanetForId(entry.id);
  if (md?.meta.accountId) meta.accountId = md.meta.accountId;
  if (md?.meta.githubAccountId) meta.githubAccountId = md.meta.githubAccountId;
  if (md?.meta.shelved) meta.shelved = true;
  return { id: entry.id, meta, memory: md?.memory ?? "", rev: md?.rev ?? EMPTY_REV };
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

/** PARTIAL update: only present keys apply, `null` clears. No roster here. */
export function updateProject(
  id: string,
  patch: { meta?: ProjectMetaPatch; memory?: string; expectedRev?: string },
  reason = "updateProject",
): Project {
  return mutateMetadata(id, reason, (cur) => {
    const meta: ProjectMeta = { ...cur.meta };
    const m = patch.meta;
    if (m) {
      if (m.name !== undefined) meta.name = m.name;
      if (m.description !== undefined) meta.description = m.description;
      if (m.shelved !== undefined) meta.shelved = m.shelved;
      if (m.planet !== undefined) meta.planet = m.planet;
      if (m.accountId !== undefined) {
        if (m.accountId === null) delete meta.accountId; else meta.accountId = m.accountId;
      }
      if (m.githubAccountId !== undefined) {
        if (m.githubAccountId === null) delete meta.githubAccountId;
        else meta.githubAccountId = m.githubAccountId;
      }
    }
    return { meta, memory: patch.memory };
  }, patch.expectedRev);
}

/** The only bulk roster path (bundle import); everything else is per-instance. */
export function replaceRoster(id: string, roster: unknown, reason = "replaceRoster"): Project {
  // Coercing to [] would turn "no roster data" into "delete every instance".
  if (!Array.isArray(roster)) {
    throw new Error(`replaceRoster('${id}') requires an array, received ${typeof roster}`);
  }
  return mutateMetadata(id, reason, (cur) => ({
    meta: { ...cur.meta, roster: normalizeRoster(roster) },
  }));
}

export function deleteProject(id: string): boolean {
  const dir = join(PROJECTS_DIR, id);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  metadataCache.delete(metadataFile(id));
  log.info("project.metadata_deleted", { id });
  return true;
}

/**
 * Permanently delete a project's folder from disk (its scanned working
 * directory) plus any ~/.claude/projects/<id> metadata. Destructive and
 * irreversible — the UI gates this behind a type-to-confirm modal.
 *
 * Guarded so it only ever removes a *direct child* of the configured projects
 * root: it refuses the root itself, nested paths, and anything resolving
 * outside the root. Returns false when the id doesn't match a scanned folder.
 */
export function removeProjectFolder(id: string): boolean {
  const settings = readSettings();
  if (!settings) return false;
  const scanned = scanProjects(settings.projectsRoot, settings.excluded, true).find((e) => e.id === id);
  if (!scanned) return false;

  const root = expandTilde(settings.projectsRoot);
  const rel = scanned.fullPath.startsWith(root + sep) ? scanned.fullPath.slice(root.length + 1) : null;
  if (!rel || rel.includes(sep)) {
    throw new Error(`refuse to remove '${scanned.fullPath}': not a direct child of the projects root`);
  }

  rmSync(scanned.fullPath, { recursive: true, force: true });
  deleteProject(id); // also drop ~/.claude/projects/<id> metadata (no-op if absent)
  log.warn("project.folder_removed", { id, path: scanned.fullPath });
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

/** Gives the 2nd+ instance of an agent its own worktree, when the flag is on. */
function attachWorktree(
  projectId: string,
  instance: AgentInstance,
  cwd: string | undefined,
  existingCount: number,
  settings: AppSettings | null | undefined,
): void {
  if (existingCount < 1) return;
  const { instanceId, agentId } = instance;
  if (!cwd || !isGitRepo(cwd)) {
    log.info("project.instance_shared_cwd", {
      projectId, instanceId, agentId,
      note: "project is not a git repo — instance shares project cwd",
    });
    return;
  }
  if (!isFeatureEnabled(settings ?? null, "multiInstance")) return;
  try {
    const wt = createWorktree(cwd, agentId, instanceId);
    instance.worktree = wt;
    instance.cwd = wt.basePath;
  } catch (err) {
    // Graceful fallback: the instance shares the project cwd.
    log.warn("project.worktree_create_failed", {
      projectId, instanceId, agentId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Appended against the roster on disk NOW, not the copy read before the worktree. */
function appendInstance(projectId: string, instance: AgentInstance): Project {
  return mutateMetadata(projectId, "addInstance", (cur) => ({
    meta: { ...cur.meta, roster: [...cur.meta.roster, instance] },
  }));
}

/** A refused write would otherwise leak the worktree until the next reconcile. */
function discardWorktree(projectId: string, instance: AgentInstance, cwd: string | undefined): void {
  if (!instance.worktree || !cwd) return;
  try {
    removeWorktree(cwd, instance.worktree);
  } catch (err) {
    log.warn("project.worktree_orphaned", {
      projectId,
      instanceId: instance.instanceId,
      err: err instanceof Error ? err.message : String(err),
    });
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

  attachWorktree(projectId, instance, p.meta.cwd, existingCount, settings);

  // Against the roster on disk NOW: worktree creation takes time.
  let project: Project;
  try {
    project = appendInstance(projectId, instance);
  } catch (err) {
    discardWorktree(projectId, instance, p.meta.cwd);
    throw err;
  }
  log.info("project.instance_added", { projectId, instanceId: instance.instanceId, agentId });
  return { project, instance };
}

export function patchInstance(
  projectId: string,
  instanceId: string,
  patch: Partial<Omit<AgentInstance, "instanceId" | "agentId">>,
): Project {
  const project = mutateMetadata(projectId, "patchInstance", (cur) => {
    const idx = cur.meta.roster.findIndex((i) => i.instanceId === instanceId);
    if (idx === -1) throw new Error(`instance '${instanceId}' not found`);
    const updated: AgentInstance = { ...cur.meta.roster[idx]!, ...patch };
    for (const k of ["label", "model", "effort", "permissionMode", "room"] as const) {
      if (k in patch && patch[k] === "") delete updated[k];
    }
    const roster = [...cur.meta.roster];
    roster[idx] = updated;
    return { meta: { ...cur.meta, roster } };
  });
  log.info("project.instance_patched", { projectId, instanceId });
  return project;
}

export function removeInstance(projectId: string, instanceId: string): Project {
  const p = readProject(projectId);
  if (!p) throw new Error(`project '${projectId}' not found`);
  const instance = p.meta.roster.find((i) => i.instanceId === instanceId);
  if (!instance) throw new Error(`instance '${instanceId}' not found`);

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

  // By id against current state, never a roster snapshot.
  const project = mutateMetadata(projectId, "removeInstance", (cur) => ({
    meta: { ...cur.meta, roster: cur.meta.roster.filter((i) => i.instanceId !== instanceId) },
  }));
  // Transcript rows (runs, messages, tool_calls) are archived, not deleted.
  log.info("project.instance_removed", { projectId, instanceId });
  return project;
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
  const seen = p.meta.roster[idx]!;
  if (seen.cwd === undefined && seen.worktree === undefined) return;
  mutateMetadata(projectId, "clearStaleWorktree", (cur) => {
    const i = cur.meta.roster.findIndex((x) => x.instanceId === instanceId);
    if (i === -1) return { meta: cur.meta };
    const inst = { ...cur.meta.roster[i]! };
    delete inst.cwd;
    delete inst.worktree;
    const roster = [...cur.meta.roster];
    roster[i] = inst;
    return { meta: { ...cur.meta, roster } };
  });
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
  "terran": 5,
  "ringed-terran": 5,
  "toxic": 5,
  "ice": 5,
  "islands": 5,
  "lava": 5,
  "ice-moon": 5,
  "eclipse": 5,
  "black-hole": 5,
  "galaxy": 5,
  "star": 5,
  "asteroid": 5,
  "comet": 5,
};

function autoRandomPlanet(): PlanetConfig {
  const types = Array.from(PLANET_TYPES);
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

/**
 * Deterministic 32-bit FNV-1a hash of a project id. Stable across sessions,
 * processes and devices — same id always yields the same number.
 */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A stable, high-quality planet derived purely from the project id.
 *
 * This is the guarantee that a project ALWAYS has a good-looking planet.
 * It's used whenever a project has no persisted `planet` in its metadata:
 * a freshly scanned folder, a fresh device whose `project.md` doesn't exist
 * yet, or metadata that predates / fails the planet parser. Without it the
 * frontend falls back to a low-res procedural placeholder (pixels: 50,
 * gas-giant/rocky only) — the "low quality planet" bug.
 *
 * Deterministic (seeded from the id) so the planet never changes between
 * scans or devices, and full-quality (all curated types, pixels: 1000).
 */
function defaultPlanetForId(id: string): PlanetConfig {
  const types = Array.from(PLANET_TYPES);
  const h = hashId(id);
  const type = types[h % types.length]!;
  const paletteCount = PLANET_TYPE_PALETTE_COUNTS[type];
  return {
    type,
    seed: (h % 999_999_999) + 1,
    paletteIdx: Math.floor(h / 97) % paletteCount,
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
  // Never a blind overwrite: POST with an existing id erased the roster,
  // accountId, unknown keys and memory, bypassing mutateMetadata entirely.
  if (existsSync(metadataFile(id))) {
    const patch: ProjectMetaPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    return updateProject(id, { meta: patch }, "createProject.adopt");
  }
  const meta: ProjectMeta = {
    name: input.name ?? scanned.name,
    description: input.description ?? "",
    cwd: scanned.fullPath,
    roster: normalizeRoster(input.roster),
    planet: input.planet ?? autoRandomPlanet(),
  };
  const rev = writeMetadata(id, meta, "", "createProject");
  log.info("project.metadata_created", { id });
  return { id, meta, memory: "", rev };
}
