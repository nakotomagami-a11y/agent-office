// Server-only helpers + data logic for the starter-data routes
// (GET/POST /api/starter/agents and /api/starter/agent-diff).
//
// Deliberately lives in apps/web, NOT @agent-office/domain: importing the domain
// package here would make Next's transpilePackages pull the whole shared package
// into these route bundles. The frontmatter we read is a tiny string-scalar
// subset, so a hand-rolled parser keeps the routes self-contained and lean.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export const AGENTS_DIR = join(homedir(), ".claude", "agents");
const ARCHIVE_DIR = join(AGENTS_DIR, "_archive");
const STATE_DIR = join(homedir(), ".claude", "agent-office");
const VERSION_FILE = join(STATE_DIR, "agent-manifest-version");
const SKIP_FILE = join(STATE_DIR, "agent-manifest-skipped.json");

const SLUG_RE = /^[A-Za-z0-9._-]+$/;

/** Agent-id / slug validator shared by the importer and the migration applier. */
export function isValidSlug(s: unknown): s is string {
  return typeof s === "string" && SLUG_RE.test(s);
}

/** First 16 chars of sha256 — matches the manifest generator's short hash. */
function shortHash(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

/** Locate the bundled starter-data dir across dev/build/env layouts. */
export function resolveStarterDataDir(): string | null {
  const candidates = [
    process.env["AGENT_OFFICE_STARTER_DATA"],
    join(process.cwd(), "starter-data"),
    join(process.cwd(), "apps", "web", "starter-data"),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isDirectory()) return c;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

export interface StarterFrontmatter {
  name?: string;
  description?: string;
  unit?: string;
}

/** Pull name/description/unit from a hand-rolled YAML frontmatter block. */
export function parseFrontmatterSubset(raw: string): StarterFrontmatter {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return {};
  const out: StarterFrontmatter = {};
  for (const line of m[1]!.split(/\n/)) {
    const kv = line.match(/^(name|description|unit):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2]!.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[kv[1] as keyof StarterFrontmatter] = val;
  }
  return out;
}

// ─── Starter catalogue + importer (GET/POST /api/starter/agents) ─────────────

export interface StarterAgent {
  id: string;
  name: string;
  description: string;
  unit?: string;
}

export function listStarterAgents(): StarterAgent[] {
  const starterDir = resolveStarterDataDir();
  if (!starterDir) return [];
  const agentsDir = join(starterDir, "agents");
  if (!existsSync(agentsDir)) return [];
  const out: StarterAgent[] = [];
  for (const f of readdirSync(agentsDir)) {
    if (!f.endsWith(".md")) continue;
    if (f.toUpperCase().startsWith("README")) continue;
    const id = f.replace(/\.md$/, "");
    const fm = parseFrontmatterSubset(readFileSync(join(agentsDir, f), "utf8"));
    out.push({ id, name: fm.name ?? id, description: fm.description ?? "", unit: fm.unit });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export type ImportResult =
  | { ok: true; imported: number; skipped: string[] }
  | { ok: false; error: string };

/** Copy the selected starter .md files into ~/.claude/agents/, never overwriting
 *  a user edit (already-present or invalid/missing ids are skipped). */
export function importStarterAgents(ids: string[]): ImportResult {
  const starterDir = resolveStarterDataDir();
  if (!starterDir) return { ok: false, error: "starter_data_missing" };
  const starterAgents = join(starterDir, "agents");
  if (!existsSync(starterAgents)) return { ok: false, error: "starter_data_missing" };

  mkdirSync(AGENTS_DIR, { recursive: true });
  let imported = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    if (!isValidSlug(id)) {
      skipped.push(id);
      continue;
    }
    const from = join(starterAgents, `${id}.md`);
    const to = join(AGENTS_DIR, `${id}.md`);
    if (!existsSync(from) || existsSync(to)) {
      skipped.push(id);
      continue;
    }
    cpSync(from, to);
    imported++;
  }
  return { ok: true, imported, skipped };
}

// ─── Manifest diff + apply (GET/POST /api/starter/agent-diff) ────────────────

interface ManifestEntry {
  file: string;
  name: string;
  description: string;
  hash: string;
}

export interface Manifest {
  version: string;
  generated?: string;
  agents: ManifestEntry[];
}

export interface DiffEntry {
  id: string;
  name: string;
  description: string;
  bundleHash?: string;
  installedHash?: string;
}

export interface DiffResult {
  bundleVersion: string | null;
  installedVersion: string | null;
  /** Bundled but not installed. */
  newAgents: DiffEntry[];
  /** Installed AND bundled — hashes differ. */
  changed: DiffEntry[];
  /** Installed but not bundled. Untouched by accept. Surfaced for UX. */
  onlyLocal: DiffEntry[];
  /** Slugs the user chose to skip in a previous run of this same version. */
  skipped: string[];
}

function loadManifest(starterDir: string): Manifest | null {
  const path = join(starterDir, "agents", "MANIFEST.json");
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Manifest;
    if (typeof parsed.version !== "string" || !Array.isArray(parsed.agents)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readInstalledVersion(): string | null {
  try {
    if (!existsSync(VERSION_FILE)) return null;
    return readFileSync(VERSION_FILE, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function writeInstalledVersion(v: string) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(VERSION_FILE, `${v}\n`, "utf8");
}

interface SkipState {
  /** Skips are per-bundle-version so a new version re-shows them. */
  version: string;
  slugs: string[];
}

function readSkipState(): SkipState | null {
  try {
    if (!existsSync(SKIP_FILE)) return null;
    const parsed = JSON.parse(readFileSync(SKIP_FILE, "utf8")) as SkipState;
    if (typeof parsed.version !== "string" || !Array.isArray(parsed.slugs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSkipState(state: SkipState) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(SKIP_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
}

interface InstalledAgent {
  id: string;
  hash: string;
  fm: StarterFrontmatter;
}

function listInstalledAgents(): InstalledAgent[] {
  if (!existsSync(AGENTS_DIR)) return [];
  const out: InstalledAgent[] = [];
  for (const f of readdirSync(AGENTS_DIR)) {
    // Skip memory sidecars, versioned body snapshots, archive dir, dotfiles,
    // and the directory README. Mirror the domain listAgents() filter so a
    // plain doc is never mistaken for an agent (the README-as-agent nag bug).
    if (!f.endsWith(".md")) continue;
    if (f.toLowerCase() === "readme.md") continue;
    if (f.startsWith("_")) continue;
    if (f.endsWith(".memory.md")) continue;
    if (f.endsWith(".identity.md")) continue;
    if (f.includes(".body.")) continue;
    const raw = readFileSync(join(AGENTS_DIR, f), "utf8");
    // Real agents have YAML frontmatter; docs and notes do not.
    if (!/^---\n[\s\S]*?\n---\n?/.test(raw)) continue;
    out.push({ id: f.replace(/\.md$/, ""), hash: shortHash(raw), fm: parseFrontmatterSubset(raw) });
  }
  return out;
}

function computeDiff(manifest: Manifest, installed: InstalledAgent[]): {
  newAgents: DiffEntry[];
  changed: DiffEntry[];
  onlyLocal: DiffEntry[];
} {
  const bundledById = new Map(manifest.agents.map((a) => [a.name, a]));
  const installedById = new Map(installed.map((a) => [a.id, a]));

  const newAgents: DiffEntry[] = [];
  const changed: DiffEntry[] = [];
  for (const b of manifest.agents) {
    const inst = installedById.get(b.name);
    if (!inst) {
      newAgents.push({ id: b.name, name: b.name, description: b.description, bundleHash: b.hash });
      continue;
    }
    if (inst.hash !== b.hash) {
      changed.push({ id: b.name, name: b.name, description: b.description, bundleHash: b.hash, installedHash: inst.hash });
    }
  }

  const onlyLocal: DiffEntry[] = installed
    .filter((i) => !bundledById.has(i.id))
    .map((i) => ({ id: i.id, name: i.fm.name ?? i.id, description: i.fm.description ?? "", installedHash: i.hash }));

  // Deterministic order for stable UI rendering across requests.
  newAgents.sort((a, b) => a.id.localeCompare(b.id));
  changed.sort((a, b) => a.id.localeCompare(b.id));
  onlyLocal.sort((a, b) => a.id.localeCompare(b.id));
  return { newAgents, changed, onlyLocal };
}

export type DiffOutcome = { ok: true; diff: DiffResult } | { ok: false; error: string };

/** Diff the bundled MANIFEST.json against installed ~/.claude/agents/*.md. */
export function computeAgentDiff(): DiffOutcome {
  const starterDir = resolveStarterDataDir();
  if (!starterDir) return { ok: false, error: "starter_data_missing" };
  const manifest = loadManifest(starterDir);
  if (!manifest) return { ok: false, error: "manifest_missing_or_invalid" };

  const { newAgents, changed, onlyLocal } = computeDiff(manifest, listInstalledAgents());
  const skipState = readSkipState();
  return {
    ok: true,
    diff: {
      bundleVersion: manifest.version,
      installedVersion: readInstalledVersion(),
      newAgents,
      changed,
      onlyLocal,
      skipped: skipState && skipState.version === manifest.version ? skipState.slugs : [],
    },
  };
}

export interface ApplyResult {
  applied: string[];
  backedUp: string[];
  skipped: string[];
  errors: { id: string; reason: string }[];
  bundleVersion: string;
}

export type ApplyOutcome = { ok: true; result: ApplyResult } | { ok: false; error: string };

/** Back up then overwrite each accepted agent, record skips per-version, and
 *  bump the manifest version. `accept`/`skip` are raw request values — filtered
 *  to valid slugs here. `markComplete !== false` marks the version processed. */
export function applyAgentMigration(accept: unknown, skip: unknown, markComplete?: boolean): ApplyOutcome {
  const accepts = Array.isArray(accept) ? accept.filter(isValidSlug) : [];
  const skips = Array.isArray(skip) ? skip.filter(isValidSlug) : [];

  const starterDir = resolveStarterDataDir();
  if (!starterDir) return { ok: false, error: "starter_data_missing" };
  const manifest = loadManifest(starterDir);
  if (!manifest) return { ok: false, error: "manifest_missing_or_invalid" };

  const bundleAgentsDir = join(starterDir, "agents");
  const bundleSlugs = new Set(manifest.agents.map((a) => a.name));

  mkdirSync(AGENTS_DIR, { recursive: true });
  mkdirSync(ARCHIVE_DIR, { recursive: true });

  const applied: string[] = [];
  const backedUp: string[] = [];
  const errors: { id: string; reason: string }[] = [];
  for (const id of accepts) {
    if (!bundleSlugs.has(id)) {
      errors.push({ id, reason: "not_in_bundle" });
      continue;
    }
    const from = join(bundleAgentsDir, `${id}.md`);
    const to = join(AGENTS_DIR, `${id}.md`);
    if (!existsSync(from)) {
      errors.push({ id, reason: "bundle_file_missing" });
      continue;
    }
    try {
      // Back up an existing file with a version-tagged suffix so repeated
      // upgrades don't clobber history, then overwrite.
      if (existsSync(to)) {
        cpSync(to, join(ARCHIVE_DIR, `${id}.pre-${manifest.version}-backup.md`));
        backedUp.push(id);
      }
      cpSync(from, to);
      applied.push(id);
    } catch (err) {
      errors.push({ id, reason: (err as Error).message });
    }
  }

  // Persist skip choices so we don't re-nag until the bundle version changes.
  if (skips.length > 0) writeSkipState({ version: manifest.version, slugs: skips });
  // Mark this version processed once the user finishes the flow so it stops firing.
  if (markComplete !== false) writeInstalledVersion(manifest.version);

  return { ok: true, result: { applied, backedUp, skipped: skips, errors, bundleVersion: manifest.version } };
}
