/**
 * Starter-agent catalogue + importer.
 *
 *   GET  /api/starter/agents  → list of bundled starter agents with
 *      their frontmatter-derived display info. The first-run wizard
 *      renders this list so the user can pick which ones to import.
 *
 *   POST /api/starter/agents  → body { agentIds: string[] } → copies
 *      the selected `.md` files from the in-repo `starter-data/agents/`
 *      bundle into `~/.claude/agents/`. Already-present files are
 *      skipped so re-running the import never overwrites a user edit.
 */

import { NextResponse } from "next/server";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENTS_DIR = join(homedir(), ".claude", "agents");

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

interface StarterAgent {
  id: string;
  name: string;
  description: string;
  unit?: string;
}

/**
 * Parse the YAML frontmatter just well enough to pull `name` and
 * `description`. We intentionally don't pull in the shared parseYaml
 * helper here - those services live in the @agent-office/domain
 * package and `transpilePackages` would drag the whole shared package
 * into this route's bundle. The frontmatter shape we accept here is a
 * tiny subset (string scalars only) so a hand-rolled regex is enough
 * and keeps the route self-contained.
 */
function parseFrontmatterSubset(raw: string): { name?: string; description?: string; unit?: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return {};
  const block = m[1]!;
  const lines = block.split(/\n/);
  const out: { name?: string; description?: string; unit?: string } = {};
  for (const line of lines) {
    const kv = line.match(/^(name|description|unit):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1] as "name" | "description" | "unit";
    let val = kv[2]!.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function listStarterAgents(): StarterAgent[] {
  const starterDir = resolveStarterDataDir();
  if (!starterDir) return [];
  const agentsDir = join(starterDir, "agents");
  if (!existsSync(agentsDir)) return [];
  const out: StarterAgent[] = [];
  for (const f of readdirSync(agentsDir)) {
    if (!f.endsWith(".md")) continue;
    if (f.toUpperCase().startsWith("README")) continue;
    const id = f.replace(/\.md$/, "");
    const raw = readFileSync(join(agentsDir, f), "utf8");
    const fm = parseFrontmatterSubset(raw);
    out.push({
      id,
      name: fm.name ?? id,
      description: fm.description ?? "",
      unit: fm.unit,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function GET() {
  return NextResponse.json(listStarterAgents());
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
  const ids = (body as { agentIds?: unknown }).agentIds;
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) {
    return NextResponse.json({ error: "agentIds_required" }, { status: 400 });
  }
  const starterDir = resolveStarterDataDir();
  if (!starterDir) {
    return NextResponse.json({ error: "starter_data_missing" }, { status: 500 });
  }
  const starterAgents = join(starterDir, "agents");
  if (!existsSync(starterAgents)) {
    return NextResponse.json({ error: "starter_data_missing" }, { status: 500 });
  }
  mkdirSync(AGENTS_DIR, { recursive: true });
  let imported = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    if (!/^[A-Za-z0-9._-]+$/.test(id)) {
      skipped.push(id);
      continue;
    }
    const from = join(starterAgents, `${id}.md`);
    const to = join(AGENTS_DIR, `${id}.md`);
    if (!existsSync(from)) {
      skipped.push(id);
      continue;
    }
    if (existsSync(to)) {
      skipped.push(id);
      continue;
    }
    cpSync(from, to);
    imported++;
  }
  return NextResponse.json({ imported, skipped });
}
