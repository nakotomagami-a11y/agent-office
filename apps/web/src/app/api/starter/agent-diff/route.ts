/**
 * Agent migration diff + apply.
 *
 *   GET  /api/starter/agent-diff  → returns the diff between the bundled
 *      MANIFEST.json (`apps/web/starter-data/agents/MANIFEST.json`) and
 *      the installed agents at `~/.claude/agents/*.md`. Three categories:
 *
 *        - `newAgents`  — bundled but not installed. First-time additions
 *                         a fresh clone would import.
 *        - `changed`    — installed AND bundled, but the file hash differs.
 *                         Candidates for override (with per-row user consent).
 *        - `onlyLocal`  — installed but not bundled. The user's own agents
 *                         or ones we removed upstream. Never touched by
 *                         accept — surfaced so the user knows what stays.
 *
 *      Also returns `bundleVersion` (from MANIFEST) and `installedVersion`
 *      (from `~/.claude/agent-office/agent-manifest-version`, may be null
 *      on first launch).
 *
 *   POST /api/starter/agent-diff  → body { accept: string[], skip: string[] }
 *      → applies the user's choices:
 *
 *        - For each id in `accept`: back up the installed file (if any) to
 *          `~/.claude/agents/_archive/<id>.pre-<version>-backup.md`, then
 *          copy the bundled file over.
 *        - `skip` is recorded in a per-version state file so re-shown items
 *          don't nag on the next launch until the bundle changes again.
 *        - After the run, write the current bundleVersion to
 *          `~/.claude/agent-office/agent-manifest-version` so subsequent
 *          launches don't retrigger for this version.
 *
 * Self-contained: hand-rolls frontmatter + hash logic to avoid pulling the
 * shared package into this route's bundle (matches the sibling
 * `/api/starter/agents` pattern).
 */

import { NextResponse } from "next/server";
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

const AGENTS_DIR = join(homedir(), ".claude", "agents");
const ARCHIVE_DIR = join(AGENTS_DIR, "_archive");
const STATE_DIR = join(homedir(), ".claude", "agent-office");
const VERSION_FILE = join(STATE_DIR, "agent-manifest-version");
const SKIP_FILE = join(STATE_DIR, "agent-manifest-skipped.json");

interface ManifestEntry {
  file: string;
  name: string;
  description: string;
  hash: string;
}

interface Manifest {
  version: string;
  generated?: string;
  agents: ManifestEntry[];
}

interface DiffEntry {
  id: string;
  name: string;
  description: string;
  bundleHash?: string;
  installedHash?: string;
}

interface DiffResponse {
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

/** Match the sibling starter-agents route's data-dir resolution. */
function resolveStarterDataDir(): string | null {
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

/** Same short-hash the manifest generator uses — first 16 chars of sha256. */
function shortHash(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

/** Extract `name` + `description` from a hand-rolled YAML frontmatter block. */
function parseFrontmatterSubset(raw: string): { name?: string; description?: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return {};
  const out: { name?: string; description?: string } = {};
  for (const line of m[1]!.split(/\n/)) {
    const kv = line.match(/^(name|description):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2]!.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[kv[1] as "name" | "description"] = val;
  }
  return out;
}

function loadManifest(starterDir: string): Manifest | null {
  const path = join(starterDir, "agents", "MANIFEST.json");
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Manifest;
    if (typeof parsed.version !== "string" || !Array.isArray(parsed.agents)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readInstalledVersion(): string | null {
  try {
    if (!existsSync(VERSION_FILE)) return null;
    const v = readFileSync(VERSION_FILE, "utf8").trim();
    return v || null;
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
    const raw = readFileSync(SKIP_FILE, "utf8");
    const parsed = JSON.parse(raw) as SkipState;
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
  fm: { name?: string; description?: string };
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
    out.push({
      id: f.replace(/\.md$/, ""),
      hash: shortHash(raw),
      fm: parseFrontmatterSubset(raw),
    });
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
      newAgents.push({
        id: b.name,
        name: b.name,
        description: b.description,
        bundleHash: b.hash,
      });
      continue;
    }
    if (inst.hash !== b.hash) {
      changed.push({
        id: b.name,
        name: b.name,
        description: b.description,
        bundleHash: b.hash,
        installedHash: inst.hash,
      });
    }
  }

  const onlyLocal: DiffEntry[] = installed
    .filter((i) => !bundledById.has(i.id))
    .map((i) => ({
      id: i.id,
      name: i.fm.name ?? i.id,
      description: i.fm.description ?? "",
      installedHash: i.hash,
    }));

  // Deterministic order for stable UI rendering across requests.
  newAgents.sort((a, b) => a.id.localeCompare(b.id));
  changed.sort((a, b) => a.id.localeCompare(b.id));
  onlyLocal.sort((a, b) => a.id.localeCompare(b.id));

  return { newAgents, changed, onlyLocal };
}

export async function GET() {
  const starterDir = resolveStarterDataDir();
  if (!starterDir) {
    return NextResponse.json({ error: "starter_data_missing" }, { status: 500 });
  }
  const manifest = loadManifest(starterDir);
  if (!manifest) {
    return NextResponse.json({ error: "manifest_missing_or_invalid" }, { status: 500 });
  }
  const installed = listInstalledAgents();
  const { newAgents, changed, onlyLocal } = computeDiff(manifest, installed);

  const installedVersion = readInstalledVersion();
  const skipState = readSkipState();
  const skipped = skipState && skipState.version === manifest.version ? skipState.slugs : [];

  const body: DiffResponse = {
    bundleVersion: manifest.version,
    installedVersion,
    newAgents,
    changed,
    onlyLocal,
    skipped,
  };
  return NextResponse.json(body);
}

interface ApplyBody {
  accept?: string[];
  skip?: string[];
  /** If true, marks THIS version as fully processed so no modal shows again for it. */
  markComplete?: boolean;
}

interface ApplyResponse {
  applied: string[];
  backedUp: string[];
  skipped: string[];
  errors: { id: string; reason: string }[];
  bundleVersion: string;
}

/** Slug validator matching the sibling route's shape. */
function isValidSlug(s: unknown): s is string {
  return typeof s === "string" && /^[A-Za-z0-9._-]+$/.test(s);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { accept, skip, markComplete } = body as ApplyBody;
  const accepts = Array.isArray(accept) ? accept.filter(isValidSlug) : [];
  const skips = Array.isArray(skip) ? skip.filter(isValidSlug) : [];

  const starterDir = resolveStarterDataDir();
  if (!starterDir) {
    return NextResponse.json({ error: "starter_data_missing" }, { status: 500 });
  }
  const manifest = loadManifest(starterDir);
  if (!manifest) {
    return NextResponse.json({ error: "manifest_missing_or_invalid" }, { status: 500 });
  }
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
      // Back up existing file if present. Non-destructive rename with a
      // version-tagged suffix so multiple upgrades don't clobber history.
      if (existsSync(to)) {
        const backupPath = join(
          ARCHIVE_DIR,
          `${id}.pre-${manifest.version}-backup.md`,
        );
        cpSync(to, backupPath);
        backedUp.push(id);
      }
      cpSync(from, to);
      applied.push(id);
    } catch (err) {
      errors.push({ id, reason: (err as Error).message });
    }
  }

  // Persist skip choices so we don't re-nag until the bundle version changes.
  if (skips.length > 0) {
    writeSkipState({ version: manifest.version, slugs: skips });
  }

  // Mark this bundle version as processed once the user finishes the flow
  // (accept-all / skip-all / any submit) so the trigger stops firing.
  if (markComplete !== false) {
    writeInstalledVersion(manifest.version);
  }

  const responseBody: ApplyResponse = {
    applied,
    backedUp,
    skipped: skips,
    errors,
    bundleVersion: manifest.version,
  };
  return NextResponse.json(responseBody);
}
