// Data logic for /api/starter/agents and /api/starter/agent-diff.
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
import { join } from "node:path";
import type { z } from "zod";
import { parseJson } from "@agent-office/api-contract";
import { AGENTS_DIR, AGENT_BACKUPS_DIR, APP_STATE_DIR } from "@agent-office/domain/services/infra/paths";
import { agentInstallRecordSchema, starterManifestSchema, starterSkipStateSchema } from "./disk-schemas";

const VERSION_FILE = join(APP_STATE_DIR, "agent-manifest-version");
const SKIP_FILE = join(APP_STATE_DIR, "agent-manifest-skipped.json");
const INSTALL_RECORD_FILE = join(APP_STATE_DIR, "agent-install-record.json");

const SLUG_RE = /^[A-Za-z0-9._-]+$/;

/** Agent-id / slug validator shared by the importer and the migration applier. */
export function isValidSlug(s: unknown): s is string {
  return typeof s === "string" && SLUG_RE.test(s);
}

/** First 16 chars of sha256 — matches the manifest generator's short hash. */
function shortHash(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

/** Bundle versions are `YYYY-MM-DD-N`, compared field by field as numbers (as strings,
 *  `-10` sorts before `-9`). Null when either is unparseable: no order is known. */
export function compareBundleVersions(a: string, b: string): number | null {
  const parse = (v: string) => /^(\d{4})-(\d{2})-(\d{2})-(\d+)$/.exec(v.trim())?.slice(1).map(Number) ?? null;
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
  return 0;
}

/** An older build (the installed app next to a dev checkout) shares ~/.claude with a newer one
 *  and must never offer its older agents over the newer ones (S1-1). */
function bundleIsOlder(bundle: string, installed: string | null): boolean {
  if (!installed) return false;
  const c = compareBundleVersions(bundle, installed);
  return c !== null && c < 0;
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
  room?: string;
}

/** Pull name/description/unit/room from a hand-rolled YAML frontmatter block. */
export function parseFrontmatterSubset(raw: string): StarterFrontmatter {
  // Git on Windows checks the bundle out with CRLF: an LF-only match found no frontmatter (S1-4).
  const m = raw.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return {};
  const out: StarterFrontmatter = {};
  for (const line of m[1]!.split(/\n/)) {
    const kv = line.match(/^(name|description|unit|room):\s*(.*)$/);
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
  room?: string;
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
    out.push({ id, name: fm.name ?? id, description: fm.description ?? "", unit: fm.unit, room: fm.room });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export type ImportResult =
  | { ok: true; imported: number; skipped: string[] }
  | { ok: false; error: string };

/** Copy the selected starter .md files into ~/.claude/agents/, never overwriting
 *  a user edit (already-present or invalid/missing ids are skipped). This is the
 *  first-run import, so it also records what was installed and what was turned down:
 *  otherwise the migration modal opens right after it, offering the declined agents again (S1-3). */
export function importStarterAgents(ids: string[]): ImportResult {
  const starterDir = resolveStarterDataDir();
  if (!starterDir) return { ok: false, error: "starter_data_missing" };
  const starterAgents = join(starterDir, "agents");
  if (!existsSync(starterAgents)) return { ok: false, error: "starter_data_missing" };

  mkdirSync(AGENTS_DIR, { recursive: true });
  const imported: string[] = [];
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
    imported.push(id);
  }

  const manifest = loadManifest(starterDir);
  if (manifest) {
    const record = readInstallRecord();
    const chosen = new Set(ids);
    for (const a of manifest.agents) {
      if (imported.includes(a.name)) record.agents[a.name] = a.hash;
      else if (!chosen.has(a.name) && !existsSync(join(AGENTS_DIR, `${a.name}.md`))) record.declined.push(a.name);
    }
    record.declined = [...new Set(record.declined)].filter((id) => !imported.includes(id));
    writeInstallRecord(record);
    if (!bundleIsOlder(manifest.version, readInstalledVersion())) writeInstalledVersion(manifest.version);
  }
  return { ok: true, imported: imported.length, skipped };
}

// ─── Manifest diff + apply (GET/POST /api/starter/agent-diff) ────────────────

type Manifest = z.infer<typeof starterManifestSchema>;
type InstallRecord = z.infer<typeof agentInstallRecordSchema>;

/** Why an installed agent differs from the bundle, judged against the hash it was installed from. */
export type AgentChange = "bundle_changed" | "edited_locally" | "both" | "unknown";

export interface DiffEntry {
  id: string;
  name: string;
  description: string;
  bundleHash?: string;
  installedHash?: string;
  change?: AgentChange;
  declined?: boolean;
}

export interface DiffResult {
  bundleVersion: string | null;
  installedVersion: string | null;
  bundleOlder: boolean;
  /** Bundled but not installed. */
  newAgents: DiffEntry[];
  changed: DiffEntry[];
  /** Only the local copy changed: an update would revert the user's edit. */
  editedLocally: DiffEntry[];
  /** Installed but not bundled. Untouched by accept. Surfaced for UX. */
  onlyLocal: DiffEntry[];
  /** Slugs the user chose to skip in a previous run of this same version. */
  skipped: string[];
}

function loadManifest(starterDir: string): Manifest | null {
  const path = join(starterDir, "agents", "MANIFEST.json");
  if (!existsSync(path)) return null;
  try {
    return starterManifestSchema.parse(parseJson(readFileSync(path, "utf8")));
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
  mkdirSync(APP_STATE_DIR, { recursive: true });
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
    return starterSkipStateSchema.parse(parseJson(readFileSync(SKIP_FILE, "utf8")));
  } catch {
    return null;
  }
}

function writeSkipState(state: SkipState) {
  mkdirSync(APP_STATE_DIR, { recursive: true });
  writeFileSync(SKIP_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function readInstallRecord(): InstallRecord {
  try {
    if (existsSync(INSTALL_RECORD_FILE)) {
      return agentInstallRecordSchema.parse(parseJson(readFileSync(INSTALL_RECORD_FILE, "utf8")));
    }
  } catch {
    /* unreadable = no record: every difference is "unknown", never assumed safe */
  }
  return { agents: {}, declined: [] };
}

function writeInstallRecord(record: InstallRecord) {
  mkdirSync(APP_STATE_DIR, { recursive: true });
  writeFileSync(INSTALL_RECORD_FILE, JSON.stringify(record, null, 2) + "\n", "utf8");
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
    const raw = readFileSync(join(AGENTS_DIR, f), "utf8").replace(/\r\n/g, "\n");
    // LF as the manifest hashes it (a Windows copy is the same agent); real agents have frontmatter, docs don't.
    if (!/^---\n[\s\S]*?\n---\n?/.test(raw)) continue;
    out.push({ id: f.replace(/\.md$/, ""), hash: shortHash(raw), fm: parseFrontmatterSubset(raw) });
  }
  return out;
}

function classifyChange(installedHash: string, bundleHash: string, recordedHash: string | undefined): AgentChange {
  if (!recordedHash) return "unknown";
  const local = installedHash !== recordedHash;
  const bundle = bundleHash !== recordedHash;
  if (local && bundle) return "both";
  return local ? "edited_locally" : "bundle_changed";
}

function computeDiff(manifest: Manifest, installed: InstalledAgent[], record: InstallRecord) {
  const bundledById = new Map(manifest.agents.map((a) => [a.name, a]));
  const installedById = new Map(installed.map((a) => [a.id, a]));
  const declined = new Set(record.declined);

  const newAgents: DiffEntry[] = [];
  const changed: DiffEntry[] = [];
  const editedLocally: DiffEntry[] = [];
  for (const b of manifest.agents) {
    const inst = installedById.get(b.name);
    if (!inst) {
      newAgents.push({ id: b.name, name: b.name, description: b.description, bundleHash: b.hash, ...(declined.has(b.name) ? { declined: true } : {}) });
      continue;
    }
    if (inst.hash === b.hash) continue;
    const change = classifyChange(inst.hash, b.hash, record.agents[b.name]);
    const entry = { id: b.name, name: b.name, description: b.description, bundleHash: b.hash, installedHash: inst.hash, change };
    (change === "edited_locally" ? editedLocally : changed).push(entry);
  }

  const onlyLocal: DiffEntry[] = installed
    .filter((i) => !bundledById.has(i.id))
    .map((i) => ({ id: i.id, name: i.fm.name ?? i.id, description: i.fm.description ?? "", installedHash: i.hash }));

  // Deterministic order for stable UI rendering across requests.
  for (const list of [newAgents, changed, editedLocally, onlyLocal]) list.sort((a, b) => a.id.localeCompare(b.id));
  return { newAgents, changed, editedLocally, onlyLocal };
}

export type DiffOutcome = { ok: true; diff: DiffResult } | { ok: false; error: string };

/** Diff the bundled MANIFEST.json against installed ~/.claude/agents/*.md. */
export function computeAgentDiff(): DiffOutcome {
  const starterDir = resolveStarterDataDir();
  if (!starterDir) return { ok: false, error: "starter_data_missing" };
  const manifest = loadManifest(starterDir);
  if (!manifest) return { ok: false, error: "manifest_missing_or_invalid" };

  const installedVersion = readInstalledVersion();
  const bundleOlder = bundleIsOlder(manifest.version, installedVersion);
  const diff = computeDiff(manifest, listInstalledAgents(), readInstallRecord());
  const skipState = readSkipState();
  return {
    ok: true,
    diff: {
      bundleVersion: manifest.version,
      installedVersion,
      bundleOlder,
      ...diff,
      ...(bundleOlder ? { newAgents: [], changed: [], editedLocally: [] } : {}),
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

export type ApplyOutcome = { ok: true; result: ApplyResult } | { ok: false; error: string; status: number };

/** Back up then overwrite each accepted agent, record skips per-version, and
 *  bump the manifest version. `accept`/`skip` are raw request values — filtered
 *  to valid slugs here. `markComplete !== false` marks the version processed. */
export function applyAgentMigration(accept: unknown, skip: unknown, markComplete?: boolean): ApplyOutcome {
  const accepts = Array.isArray(accept) ? accept.filter(isValidSlug) : [];
  const skips = Array.isArray(skip) ? skip.filter(isValidSlug) : [];

  const starterDir = resolveStarterDataDir();
  if (!starterDir) return { ok: false, error: "starter_data_missing", status: 500 };
  const manifest = loadManifest(starterDir);
  if (!manifest) return { ok: false, error: "manifest_missing_or_invalid", status: 500 };
  if (bundleIsOlder(manifest.version, readInstalledVersion())) return { ok: false, error: "bundle_older", status: 409 };

  const bundleAgentsDir = join(starterDir, "agents");
  const bundleHash = new Map(manifest.agents.map((a) => [a.name, a.hash]));
  const record = readInstallRecord();

  mkdirSync(AGENTS_DIR, { recursive: true });

  const applied: string[] = [];
  const backedUp: string[] = [];
  const errors: { id: string; reason: string }[] = [];
  for (const id of accepts) {
    const hash = bundleHash.get(id);
    if (hash === undefined) {
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
      if (existsSync(to)) {
        mkdirSync(AGENT_BACKUPS_DIR, { recursive: true });
        cpSync(to, join(AGENT_BACKUPS_DIR, `${id}.pre-${manifest.version}.${Date.now()}.md`));
        backedUp.push(id);
      }
      cpSync(from, to);
      record.agents[id] = hash;
      applied.push(id);
    } catch (err) {
      errors.push({ id, reason: (err as Error).message });
    }
  }

  // A copy identical to the bundle is unedited: recording it lets installs that predate the record classify the next bundle.
  const installed = listInstalledAgents();
  for (const a of installed) if (bundleHash.get(a.id) === a.hash) record.agents[a.id] = a.hash;
  const installedIds = new Set(installed.map((a) => a.id));
  record.declined = [...new Set([...record.declined, ...skips.filter((id) => !installedIds.has(id))])]
    .filter((id) => !installedIds.has(id));
  writeInstallRecord(record);

  // Replaced, not merged: a slug un-skipped this time must not stay skipped.
  writeSkipState({ version: manifest.version, slugs: skips });
  if (markComplete !== false) writeInstalledVersion(manifest.version);

  return { ok: true, result: { applied, backedUp, skipped: skips, errors, bundleVersion: manifest.version } };
}
