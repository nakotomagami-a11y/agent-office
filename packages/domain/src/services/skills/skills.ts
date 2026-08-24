// Skill registry + install + update.
//
// Skills live at ~/.claude/agents/_skills/<name>/SKILL.md (app-managed, not
// Claude Code's global ~/.claude/skills/). Provenance recorded in
// <name>/.source.json so we can detect remote updates.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  RegistrySkill,
  InstalledSkill,
  SkillProvenance,
  SkillUpdate,
  SkillManifest,
  SkillCompatibility,
  SkillCustomization,
  SkillCustomizationMap,
  SkillSection,
  SkillIconConfig,
  SkillIconMap,
} from "../../types/index";
export type {
  SkillManifest,
  SkillManifestEntry,
  SkillCompatibility,
  SkillCustomization,
  SkillCustomizationMap,
  SkillSection,
  SkillIconConfig,
  SkillIconMap,
} from "../../types/index";
import { ensureDir, writeFileAtomic } from "../infra/fs-atomic";
import { SKILLS_DIR, isValidIdSegment } from "../infra/paths";
import { log } from "../infra/log";
import { EXTERNAL_API } from "../../config/routes";
import { parseYaml, stringifyYaml, type YamlValue } from "../infra/yaml";
import type { SkillIconClass } from "../../config/skill-icons";

const REGISTRY_CACHE = join(SKILLS_DIR, "_registry.json");
const CACHE_TTL_MS = 60 * 60 * 1000;

const REGISTRY_SOURCES = [
  { source: "anthropics/skills", ref: "main" },
  { source: "tradermonty/claude-trading-skills", ref: "main" },
  { source: "Orchestra-Research/AI-research-SKILLs", ref: "main" },
  { source: "numman-ali/openskills", ref: "main" },
];

// User-added sources persist in ~/.claude/agent-office/skill-sources.json
// so the built-in list stays fixed but the user can add their own repos
// without editing service code.
import { APP_STATE_DIR } from "../infra/paths";
const USER_SOURCES_FILE = join(APP_STATE_DIR, "skill-sources.json");

export type SourceRef = { source: string; ref: string };

function loadUserSources(): SourceRef[] {
  if (!existsSync(USER_SOURCES_FILE)) return [];
  try {
    const raw = JSON.parse(readFileSync(USER_SOURCES_FILE, "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r): r is { source: unknown; ref: unknown } => !!r && typeof r === "object")
      .map((r) => ({ source: String(r.source ?? ""), ref: String(r.ref ?? "main") }))
      .filter((r) => r.source && /^[\w.-]+\/[\w.-]+$/.test(r.source));
  } catch { return []; }
}

function saveUserSources(sources: SourceRef[]): void {
  ensureDir(APP_STATE_DIR);
  writeFileAtomic(USER_SOURCES_FILE, JSON.stringify(sources, null, 2));
}

/** All sources: hardcoded first, then user-added. Duplicates dropped. */
function allSources(): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const s of [...REGISTRY_SOURCES, ...loadUserSources()]) {
    const key = `${s.source}@${s.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Parse `https://github.com/user/repo` (with optional #branch or /tree/branch)
 * into a normalized `{ source, ref }`. Accepts owner/repo shorthand too.
 */
export function parseSourceInput(input: string): SourceRef | null {
  const s = input.trim();
  if (!s) return null;
  // Full URL
  const url = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([\w./-]+))?(?:#([\w./-]+))?\/?$/i.exec(s);
  if (url) {
    const owner = url[1]!;
    const repo = url[2]!;
    const ref = url[4] || url[3] || "main";
    return { source: `${owner}/${repo}`, ref };
  }
  // owner/repo shorthand
  const short = /^([\w.-]+)\/([\w.-]+?)(?:@([\w./-]+))?$/.exec(s);
  if (short) return { source: `${short[1]}/${short[2]}`, ref: short[3] || "main" };
  return null;
}

export function addUserSource(input: string): SourceRef {
  const parsed = parseSourceInput(input);
  if (!parsed) throw new Error(`invalid source: ${input}`);
  const existing = loadUserSources();
  const key = `${parsed.source}@${parsed.ref}`;
  if (existing.some((s) => `${s.source}@${s.ref}` === key)) return parsed;
  const next = [...existing, parsed];
  saveUserSources(next);
  return parsed;
}

export function removeUserSource(source: string, ref = "main"): boolean {
  const before = loadUserSources();
  const next = before.filter((s) => !(s.source === source && s.ref === ref));
  if (next.length === before.length) return false;
  saveUserSources(next);
  return true;
}

interface CachedRegistry {
  fetchedAt: number;
  entries: RegistrySkill[];
}

const TAG_RULES: Array<{ tag: string; patterns: RegExp[]; sources?: string[] }> = [
  { tag: "documents", patterns: [/\b(pdf|docx?|pptx?|xlsx?|word|excel|powerpoint|spreadsheet|document)\b/i] },
  { tag: "design", patterns: [/\b(design|visual|theme|brand|canvas|color|typograph|layout)\b/i] },
  { tag: "art", patterns: [/\b(art|creative|generative|algorithmic|painting|aesthetic)\b/i] },
  { tag: "testing", patterns: [/\b(test|qa|playwright|cypress|webapp.testing|browser.test)\b/i] },
  { tag: "web", patterns: [/\b(web|frontend|html|css|javascript|browser)\b/i] },
  { tag: "api", patterns: [/\b(api|sdk|rest|graphql|endpoint)\b/i] },
  { tag: "documentation", patterns: [/\b(docs?|readme|tutorial|guide|markdown)\b/i] },
  { tag: "automation", patterns: [/\b(automat|workflow|orchestrat|agent|scheduled)\b/i] },
  { tag: "scraping", patterns: [/\b(scrap|crawl|extract|harvest|firecrawl)\b/i] },
  { tag: "search", patterns: [/\b(search|retrieval|rag|index)\b/i] },
  { tag: "mcp", patterns: [/\b(mcp|model.context.protocol)\b/i] },
  { tag: "security", patterns: [/\b(security|vuln|audit|owasp|csrf|xss|secret)\b/i] },
  { tag: "code-quality", patterns: [/\b(refactor|code.review|lint|format)\b/i] },
  { tag: "trading", patterns: [/\b(trade|trading|strateg|position|market|portfolio|broker)\b/i] },
  { tag: "stocks", patterns: [/\b(stock|equity|equities|sp500|s&p|nasdaq|nyse)\b/i] },
  { tag: "crypto", patterns: [/\b(crypto|btc|bitcoin|eth|ethereum|on.chain|defi|coin)\b/i] },
  { tag: "earnings", patterns: [/\b(earnings|sec|filing|10[-_]?[KkQq]|fundamentals)\b/i] },
  { tag: "calendar", patterns: [/\b(calendar|schedule|event.driven|economic.calendar)\b/i] },
  { tag: "sentiment", patterns: [/\b(sentiment|news.analysis|social.signal)\b/i] },
  { tag: "technical-analysis", patterns: [/\b(technical.analysis|indicator|rsi|macd|moving.average|chart)\b/i] },
  { tag: "risk", patterns: [/\b(risk|drawdown|stop.loss|position.sizing|kelly)\b/i] },
  { tag: "backtest", patterns: [/\b(backtest|walk.forward|monte.carlo|out.of.sample)\b/i] },
  { tag: "ml-training", patterns: [/\b(training|fine.tun|pretrain|optimizer|gradient|trainer)\b/i] },
  { tag: "ml-inference", patterns: [/\b(inference|serv|deploy.model|onnx|tensorrt)\b/i] },
  { tag: "transformers", patterns: [/\b(transformer|attention|gpt|llama|mistral|llm)\b/i] },
  { tag: "tokenization", patterns: [/\b(tokeniz|bpe|sentencepiece|vocab)\b/i] },
  { tag: "embeddings", patterns: [/\b(embedding|vector|semantic|sentence.transformer)\b/i] },
  { tag: "rag", patterns: [/\b(rag|retrieval.augmented|reranker|qdrant|chroma|faiss|pinecone)\b/i] },
  { tag: "evaluation", patterns: [/\b(eval|benchmark|metric|score|leaderboard|promptfoo)\b/i] },
  { tag: "prompt", patterns: [/\b(prompt|few.shot|prompting)\b/i] },
  { tag: "datasets", patterns: [/\b(dataset|corpus|huggingface)\b/i] },
  { tag: "rl", patterns: [/\b(reinforcement|policy|reward|ppo|trl|dpo)\b/i] },
  { tag: "python", patterns: [/\b(python|py|pip|conda|pytorch|tensorflow|jupyter)\b/i] },
  { tag: "javascript", patterns: [/\b(javascript|typescript|nodejs?|npm|bun|deno|react|next)\b/i] },
  { tag: "shell", patterns: [/\b(bash|shell|cli|terminal)\b/i] },
  { tag: "slack", patterns: [/\b(slack|gif)\b/i] },
  { tag: "presentations", patterns: [/\b(pptx|powerpoint|slide|deck|present)\b/i] },
];

const SOURCE_TAGS: Record<string, string[]> = {
  "anthropics/skills": ["anthropic", "official"],
  "tradermonty/claude-trading-skills": ["trading", "community"],
  "Orchestra-Research/AI-research-SKILLs": ["ai-research", "ml", "community"],
  "numman-ali/openskills": ["example", "community"],
};

function deriveTags(source: string, name: string, description: string, path: string): string[] {
  const haystack = [name, description, path].join(" ").toLowerCase();
  const tags = new Set<string>();
  for (const t of SOURCE_TAGS[source] ?? []) tags.add(t);
  for (const rule of TAG_RULES) {
    if (rule.sources && !rule.sources.includes(source)) continue;
    if (rule.patterns.some((p) => p.test(haystack))) tags.add(rule.tag);
  }
  return Array.from(tags).sort();
}

function ensureSkillsDir(): void {
  ensureDir(SKILLS_DIR);
}

function loadCachedRegistry(): CachedRegistry | null {
  if (!existsSync(REGISTRY_CACHE)) return null;
  try {
    return JSON.parse(readFileSync(REGISTRY_CACHE, "utf8")) as CachedRegistry;
  } catch {
    return null;
  }
}

function saveCachedRegistry(c: CachedRegistry): void {
  ensureSkillsDir();
  writeFileAtomic(REGISTRY_CACHE, JSON.stringify(c, null, 2));
}

export function isInstalled(name: string): boolean {
  return existsSync(join(SKILLS_DIR, name, "SKILL.md"));
}

function provenancePath(name: string): string {
  return join(SKILLS_DIR, name, ".source.json");
}

function readProvenance(name: string): SkillProvenance | null {
  const p = provenancePath(name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as SkillProvenance;
  } catch {
    return null;
  }
}

interface TreeEntry {
  path: string;
  type: string;
  sha: string;
  /** Blob byte size (present for type === "blob" in the GitHub tree API). */
  size?: number;
}

async function fetchTree(source: string, ref: string): Promise<TreeEntry[]> {
  const url = EXTERNAL_API.github.gitTree(source, ref);
  const res = await fetch(url, { headers: { "User-Agent": "agent-office" } });
  if (!res.ok) throw new Error(`tree ${source}@${ref}: ${res.status}`);
  const data = (await res.json()) as { tree: TreeEntry[]; truncated?: boolean };
  if (data.truncated) log.warn("tree.truncated", { source, ref });
  return data.tree;
}

async function fetchSkillMd(source: string, ref: string, path: string): Promise<string> {
  const rawUrl = EXTERNAL_API.github.rawFile(source, ref, path);
  const res = await fetch(rawUrl);
  if (!res.ok) throw new Error(`raw ${path}: ${res.status}`);
  return res.text();
}

function parseFrontmatterDescription(content: string): string {
  // Normalize CRLF — GitHub-hosted SKILL.md files are often \r\n, which the
  // `\n`-anchored frontmatter regex would otherwise fail to match entirely.
  const fm = content.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return "";
  try {
    const meta = parseYaml(fm[1]!) as { description?: string };
    return meta?.description ?? "";
  } catch {
    return "";
  }
}

function dedupeName(name: string, source: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const suffix = source.split("/").pop() ?? source;
  const withSuffix = `${name}@${suffix}`;
  if (!used.has(withSuffix)) {
    used.add(withSuffix);
    return withSuffix;
  }
  let n = 2;
  while (used.has(`${withSuffix}-${n}`)) n++;
  used.add(`${withSuffix}-${n}`);
  return `${withSuffix}-${n}`;
}

async function pLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...await Promise.all(items.slice(i, i + limit).map(fn)));
  }
  return results;
}

/** Re-derive volatile fields (tags, installed state) on a cached entry set. */
function hydrate(entries: RegistrySkill[]): RegistrySkill[] {
  return entries.map((e) => ({
    ...e,
    tags: e.tags?.length ? e.tags : deriveTags(e.source, e.name, e.description, e.path),
    installed: isInstalled(e.name),
  }));
}

// One network refresh at a time; concurrent callers (a blocking cold fetch, a
// background revalidate) coalesce onto the same promise.
let refreshInFlight: Promise<RegistrySkill[]> | null = null;

function startRefresh(prev: CachedRegistry | null): Promise<RegistrySkill[]> {
  if (refreshInFlight) return refreshInFlight;
  const p = refreshRegistry(prev).finally(() => {
    if (refreshInFlight === p) refreshInFlight = null;
  });
  refreshInFlight = p;
  return p;
}

/**
 * Hit GitHub and rebuild the registry. Descriptions are reused from the
 * previous cache keyed by git blob SHA: a SKILL.md's content is uniquely
 * identified by its SHA, so an unchanged skill needs no network fetch. A cold
 * start fetches every description (~one request per skill); every refresh after
 * that fetches only what actually changed — usually a handful of tree calls.
 */
async function refreshRegistry(prev: CachedRegistry | null): Promise<RegistrySkill[]> {
  const descBySha = new Map<string, string>();
  for (const e of prev?.entries ?? []) {
    // Only reuse non-empty descriptions so a transient fetch failure (stored as
    // "") is retried next refresh instead of being cached forever.
    if (e.sha && e.description) descBySha.set(e.sha, e.description);
  }

  const out: RegistrySkill[] = [];
  const usedNames = new Set<string>();

  for (const src of allSources()) {
    try {
      const tree = await fetchTree(src.source, src.ref);
      const skillBlobs = tree.filter((t) => t.type === "blob" && t.path.endsWith("/SKILL.md"));

      const results = await pLimit(skillBlobs, 5, async (blob) => {
        const dirPath = blob.path.slice(0, -"/SKILL.md".length);
        const rawName = dirPath.split("/").pop() ?? dirPath;
        let description = descBySha.get(blob.sha) ?? "";
        if (!description) {
          try {
            const content = await fetchSkillMd(src.source, src.ref, blob.path);
            description = parseFrontmatterDescription(content);
          } catch (e) {
            log.warn("registry.fetch_skill_failed", { path: blob.path, err: String(e) });
          }
        }
        return {
          source: src.source,
          ref: src.ref,
          rawName,
          description,
          path: dirPath,
          sha: blob.sha,
          size: blob.size,
        };
      });

      for (const r of results) {
        const name = dedupeName(r.rawName, src.source, usedNames);
        out.push({
          source: r.source,
          ref: r.ref,
          name,
          description: r.description,
          path: r.path,
          sha: r.sha,
          size: r.size,
          tags: deriveTags(r.source, r.rawName, r.description, r.path),
          installed: isInstalled(name),
        });
      }
    } catch (e) {
      log.warn("registry.source_failed", { source: src.source, err: String(e) });
    }
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  saveCachedRegistry({ fetchedAt: Date.now(), entries: out });
  return out;
}

export async function fetchRegistry(force = false): Promise<RegistrySkill[]> {
  const cached = loadCachedRegistry();
  const fresh = !!cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;

  if (!force && cached) {
    // Stale-while-revalidate: serve the cache instantly and, if it's past the
    // TTL, refresh in the background so the *next* load is fresh. The request
    // itself never blocks on GitHub.
    if (!fresh) {
      startRefresh(cached).catch((e) =>
        log.warn("registry.background_refresh_failed", { err: String(e) }),
      );
    }
    return hydrate(cached.entries);
  }

  // No cache yet, or an explicit refresh: block on the network this once.
  return startRefresh(cached);
}

export async function installSkill(
  source: string,
  ref: string,
  path: string,
  name: string,
): Promise<{ filesWritten: number }> {
  ensureSkillsDir();

  const tree = await fetchTree(source, ref);
  const prefix = path + "/";
  const files = tree.filter((t) => t.type === "blob" && t.path.startsWith(prefix));
  if (files.length === 0) throw new Error(`no files under ${path}`);

  const skillMdEntry = files.find((f) => f.path === `${path}/SKILL.md`);
  const skillSha = skillMdEntry?.sha ?? "";

  const dest = join(SKILLS_DIR, name);
  const staging = `${dest}.tmp-${randomUUID()}`;
  mkdirSync(staging, { recursive: true });

  let written = 0;
  try {
    for (const file of files) {
      const rel = file.path.slice(prefix.length);
      const localPath = join(staging, rel);
      mkdirSync(dirname(localPath), { recursive: true });
      const rawUrl = EXTERNAL_API.github.rawFile(source, ref, file.path);
      const fileRes = await fetch(rawUrl);
      if (!fileRes.ok) {
        log.warn("install.file_failed", { path: file.path, status: fileRes.status });
        continue;
      }
      const buf = await fileRes.arrayBuffer();
      writeFileSync(localPath, Buffer.from(buf));
      written++;
    }

    writeFileSync(
      join(staging, ".source.json"),
      JSON.stringify(
        { source, ref, path, sha: skillSha, installedAt: new Date().toISOString() },
        null,
        2,
      ),
    );

    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    renameSync(staging, dest);
  } catch (e) {
    rmSync(staging, { recursive: true, force: true });
    throw e;
  }

  log.info("skill.installed", { name, source, files: written, sha: skillSha.slice(0, 8) });
  return { filesWritten: written };
}

export function uninstallSkill(name: string): boolean {
  const dest = join(SKILLS_DIR, name);
  if (!existsSync(dest)) return false;
  rmSync(dest, { recursive: true, force: true });
  log.info("skill.removed", { name });
  return true;
}

// ── Local skill authoring (forge / edit / fork / import) ───────────────────
// User-authored skills are written straight to _skills/<name>/SKILL.md with no
// .source.json, so they classify as "local" (owned) and are never clobbered by
// a registry update.

/** Thrown when forging/importing a skill whose name is already taken. */
export class SkillExistsError extends Error {
  constructor(public readonly skillName: string) {
    super(`a skill named "${skillName}" already exists`);
    this.name = "SkillExistsError";
  }
}

export interface WriteSkillInput {
  name: string;
  description?: string;
  tags?: string[];
  /** Markdown body, or a full SKILL.md — any leading frontmatter is stripped. */
  body: string;
}

/** Return the markdown below a leading `--- … ---` block (or the input as-is). */
function stripFrontmatter(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const m = normalized.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return (m ? m[1]! : normalized).trim();
}

/** Assemble a canonical SKILL.md from structured fields + body. */
function assembleSkillMd(input: WriteSkillInput): string {
  const fm: Record<string, YamlValue> = { name: input.name };
  if (input.description) fm.description = input.description;
  if (input.tags?.length) fm.tags = input.tags;
  const front = stringifyYaml(fm).trimEnd();
  return `---\n${front}\n---\n\n${stripFrontmatter(input.body)}\n`;
}

/**
 * Forge (or overwrite) a user-owned local skill. `overwrite: false` refuses to
 * clobber an existing skill of the same name (SkillExistsError); edit/fork pass
 * `overwrite: true`.
 */
export function writeLocalSkill(
  input: WriteSkillInput,
  opts: { overwrite?: boolean } = {},
): InstalledSkill {
  const name = input.name.trim();
  if (!isValidIdSegment(name)) throw new Error(`invalid skill name: "${name}"`);
  ensureSkillsDir();
  if (!opts.overwrite && isInstalled(name)) throw new SkillExistsError(name);

  const dest = join(SKILLS_DIR, name);
  ensureDir(dest);
  writeFileAtomic(join(dest, "SKILL.md"), assembleSkillMd(input));
  // A hand-authored/forked skill is owned locally — drop any stale GitHub
  // provenance so it reads as "mine" and never gets update-clobbered.
  const prov = provenancePath(name);
  if (existsSync(prov)) rmSync(prov, { force: true });

  log.info("skill.forged", { name, overwrite: !!opts.overwrite });
  const saved = readInstalledSkill(name);
  if (!saved) throw new Error(`failed to read back forged skill "${name}"`);
  return saved;
}

/** Import a skill from pasted SKILL.md text; the name comes from frontmatter. */
export function importPastedSkill(content: string): InstalledSkill {
  const normalized = content.replace(/\r\n/g, "\n");
  const fm = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) {
    throw new Error("pasted content has no frontmatter — expected a `--- name/description ---` block");
  }
  let meta: { name?: string; description?: string; tags?: string[] } = {};
  try {
    meta = parseYaml(fm[1]!) as typeof meta;
  } catch {
    throw new Error("could not parse the frontmatter YAML");
  }
  const name = (meta.name ?? "").trim();
  if (!name) throw new Error("frontmatter is missing a `name`");
  return writeLocalSkill(
    { name, description: meta.description ?? "", tags: meta.tags, body: normalized },
    { overwrite: false },
  );
}

export function listInstalled(): InstalledSkill[] {
  if (!existsSync(SKILLS_DIR)) return [];
  const out: InstalledSkill[] = [];
  for (const dir of readdirSync(SKILLS_DIR)) {
    if (dir.startsWith("_")) continue;
    const skillMdPath = join(SKILLS_DIR, dir, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;
    const content = readFileSync(skillMdPath, "utf8").replace(/\r\n/g, "\n");
    const fm = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    let description = "";
    let body = content;
    if (fm) {
      try {
        const meta = parseYaml(fm[1]!) as { description?: string };
        description = meta?.description ?? "";
      } catch {
        /* leave description empty */
      }
      body = fm[2]!.trim();
    }
    out.push({
      name: dir,
      description,
      body,
      provenance: readProvenance(dir) ?? undefined,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function readInstalledSkill(name: string): InstalledSkill | null {
  const skillMdPath = join(SKILLS_DIR, name, "SKILL.md");
  if (!existsSync(skillMdPath)) return null;
  const content = readFileSync(skillMdPath, "utf8").replace(/\r\n/g, "\n");
  const fm = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  let description = "";
  let body = content;
  if (fm) {
    try {
      const meta = parseYaml(fm[1]!) as { description?: string };
      description = meta?.description ?? "";
    } catch {
      /* leave description empty */
    }
    body = fm[2]!.trim();
  }
  return {
    name,
    description,
    body,
    provenance: readProvenance(name) ?? undefined,
  };
}

export async function checkForUpdates(): Promise<SkillUpdate[]> {
  const installed = listInstalled();
  if (installed.length === 0) return [];

  const bySource = new Map<string, InstalledSkill[]>();
  for (const s of installed) {
    if (!s.provenance) continue;
    const key = `${s.provenance.source}@${s.provenance.ref}`;
    let bucket = bySource.get(key);
    if (!bucket) {
      bucket = [];
      bySource.set(key, bucket);
    }
    bucket.push(s);
  }

  const updates: SkillUpdate[] = [];
  for (const [key, skills] of bySource) {
    const [source, ref] = key.split("@") as [string, string];
    try {
      const tree = await fetchTree(source, ref);
      const byPath = new Map<string, TreeEntry>();
      for (const t of tree) if (t.type === "blob") byPath.set(t.path, t);
      for (const s of skills) {
        if (!s.provenance) continue;
        const skillMdPath = `${s.provenance.path}/SKILL.md`;
        const remote = byPath.get(skillMdPath);
        if (!remote) continue;
        if (remote.sha !== s.provenance.sha) {
          updates.push({
            name: s.name,
            currentSha: s.provenance.sha,
            latestSha: remote.sha,
            source: s.provenance.source,
            path: s.provenance.path,
          });
        }
      }
    } catch (e) {
      log.warn("update_check.source_failed", { source, err: String(e) });
    }
  }
  return updates;
}

export async function updateSkill(name: string): Promise<{ filesWritten: number; sha: string }> {
  const prov = readProvenance(name);
  if (!prov) throw new Error(`no provenance for ${name} - can't update`);
  const result = await installSkill(prov.source, prov.ref, prov.path, name);
  const newProv = readProvenance(name);
  return { filesWritten: result.filesWritten, sha: newProv?.sha ?? "" };
}

// ── Skill customizations (global, non-destructive overlay) ────────────────
//
// Users can trim a skill down to the parts they want. Customizations live in
// APP_STATE_DIR (NOT inside `_skills/<name>/`, which `installSkill` rmSyncs on
// update) so an upstream update never clobbers them. Keyed by skill name →
// applies globally: any agent using the skill sees the same trimmed version.
//
// Phase 1 ships section toggles; `overrideBody`/`basedOnSha` are reserved for
// the Phase 2 full-edit overlay.

const SKILL_CUSTOMIZATIONS_FILE = join(APP_STATE_DIR, "skill-customizations.json");

function slugifySection(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

/**
 * Split a SKILL.md body into its toggleable `##` sections. Level-2 only —
 * `###` sub-headings belong to their parent `##` block. Fence-aware so `##`
 * inside a code block isn't mistaken for a heading. Duplicate slugs get a
 * `-2`, `-3` suffix, matching stripDisabledSections' counting exactly.
 */
export function parseSkillSections(body: string): SkillSection[] {
  const out: SkillSection[] = [];
  const seen = new Map<string, number>();
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = /^##\s+(.+)$/.exec(line);
    if (!m) continue;
    const heading = m[1]!.trim();
    let slug = slugifySection(heading);
    const n = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, n);
    if (n > 1) slug = `${slug}-${n}`;
    out.push({ slug, heading });
  }
  return out;
}

/** Drop the `##` blocks whose slug is in `disabled` (heading → next `##`). */
function stripDisabledSections(body: string, disabled: Set<string>): string {
  if (disabled.size === 0) return body;
  const out: string[] = [];
  const seen = new Map<string, number>();
  let inFence = false;
  let skipping = false;
  for (const line of body.split("\n")) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      if (!skipping) out.push(line);
      continue;
    }
    const m = !inFence ? /^##\s+(.+)$/.exec(line) : null;
    if (m) {
      const heading = m[1]!.trim();
      let slug = slugifySection(heading);
      const n = (seen.get(slug) ?? 0) + 1;
      seen.set(slug, n);
      if (n > 1) slug = `${slug}-${n}`;
      skipping = disabled.has(slug);
      if (skipping) continue;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function getSkillCustomizations(): SkillCustomizationMap {
  if (!existsSync(SKILL_CUSTOMIZATIONS_FILE)) return {};
  try {
    const raw = JSON.parse(readFileSync(SKILL_CUSTOMIZATIONS_FILE, "utf8"));
    return raw && typeof raw === "object" ? (raw as SkillCustomizationMap) : {};
  } catch {
    return {};
  }
}

export function getSkillCustomization(name: string): SkillCustomization | undefined {
  return getSkillCustomizations()[name];
}

function saveSkillCustomizations(map: SkillCustomizationMap): void {
  ensureDir(APP_STATE_DIR);
  writeFileAtomic(SKILL_CUSTOMIZATIONS_FILE, JSON.stringify(map, null, 2));
}

/** Persist a customization, pruning empty entries so the file stays tidy. */
export function setSkillCustomization(name: string, cfg: SkillCustomization): SkillCustomization {
  const map = getSkillCustomizations();
  const cleaned: SkillCustomization = {};
  if (cfg.disabledSections?.length) cleaned.disabledSections = cfg.disabledSections;
  if (cfg.overrideBody) {
    cleaned.overrideBody = cfg.overrideBody;
    if (cfg.basedOnSha) cleaned.basedOnSha = cfg.basedOnSha;
  }
  if (Object.keys(cleaned).length === 0) delete map[name];
  else map[name] = cleaned;
  saveSkillCustomizations(map);
  return cleaned;
}

export function isSkillCustomized(cfg: SkillCustomization | undefined): boolean {
  return !!(cfg?.disabledSections?.length || cfg?.overrideBody);
}

/**
 * The effective SKILL.md body after the user's global customization: a full
 * override body if set (Phase 2), else upstream, with disabled sections stripped.
 */
export function resolveSkillBody(name: string, rawBody: string): string {
  const cfg = getSkillCustomization(name);
  const base = cfg?.overrideBody ?? rawBody;
  return stripDisabledSections(base, new Set(cfg?.disabledSections ?? []));
}

// Skills enter context progressively. Tiny skills are inlined in full (cheap,
// and always-resident is worth more than the round-trip to read them). Anything
// substantial is listed as name + description + file path, so the agent reads
// the full SKILL.md only when the task actually calls for it. This is the native
// Skills pattern: a handful of heavy reference skills would otherwise cost
// 20-80K tokens per turn just sitting in the system prompt.
//
// ponytail: single size threshold, not a manifest-driven tier — the manifest's
// impact_tier doesn't separate behavioral guardrails from reference skills
// (ponytail and db-designer are both "high"), so any always-inline allowlist
// would be arbitrary config. Raise INLINE_MAX_CHARS if short guardrail skills
// start getting deferred and losing residency.
const INLINE_MAX_CHARS = 1500;

export function buildSkillsPrompt(skills: string[]): string {
  const inline: string[] = [];
  const refs: string[] = [];
  for (const name of skills) {
    const skill = readInstalledSkill(name);
    if (!skill?.body) continue;
    // Inject the effective (customized) body. A customized skill is always
    // inlined — even if large — because the reference-by-path fallback points
    // at the raw SKILL.md, which would leak the sections the user turned off.
    const cfg = getSkillCustomization(name);
    const body = resolveSkillBody(name, skill.body);
    if (!body) continue;
    if (body.length <= INLINE_MAX_CHARS || isSkillCustomized(cfg)) {
      inline.push(`### Skill: ${skill.name}\n\n${body}`);
    } else {
      const path = join(SKILLS_DIR, name, "SKILL.md");
      const desc = skill.description ? ` — ${skill.description.replace(/\s+/g, " ").trim()}` : "";
      refs.push(`- **${skill.name}**${desc}\n  Read when the task calls for it: \`${path}\``);
    }
  }
  const sections: string[] = [];
  if (inline.length > 0) sections.push(inline.join("\n\n---\n\n"));
  if (refs.length > 0) {
    sections.push(
      "### Skills available on demand\n\n" +
        "Read a skill's file only when the task calls for it — don't load them pre-emptively.\n\n" +
        refs.join("\n"),
    );
  }
  return sections.join("\n\n---\n\n");
}

export function registrySources(): Array<{ source: string; ref: string; builtIn: boolean }> {
  const users = new Set(loadUserSources().map((s) => `${s.source}@${s.ref}`));
  return allSources().map((s) => ({ source: s.source, ref: s.ref, builtIn: !users.has(`${s.source}@${s.ref}`) }));
}

// ── Static skill manifest / compatibility (curated JSON in _skills/) ──────
//
// Both files are generated/maintained externally by the user's `_install.py`
// tool. We expose them to the frontend so the skill picker can show
// cost/impact info and (future) warn about conflicting selections.

const MANIFEST_PATH = join(SKILLS_DIR, "_manifest.json");
const COMPATIBILITY_PATH = join(SKILLS_DIR, "_compatibility.json");

export function readManifest(): SkillManifest | null {
  if (!existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as SkillManifest;
  } catch (e) {
    log.warn("skills.manifest_parse_failed", { err: String(e) });
    return null;
  }
}

export function readCompatibility(): SkillCompatibility | null {
  if (!existsSync(COMPATIBILITY_PATH)) return null;
  try {
    return JSON.parse(readFileSync(COMPATIBILITY_PATH, "utf8")) as SkillCompatibility;
  } catch (e) {
    log.warn("skills.compatibility_parse_failed", { err: String(e) });
    return null;
  }
}

// ── Generated weapon icons ────────────────────────────────────────────────
// Each skill gets a deterministic procedural icon (see @agent-office/pixel-icons).
// Display seed defaults to the skill's `source/name` key so it's stable and
// "remembered" without any storage. A reroll persists an override here so the
// user can regenerate an icon and have it stick.

const SKILL_ICONS_FILE = join(APP_STATE_DIR, "skill-icons.json");

/** All persisted icon overrides, keyed by `source/name`. */
export function getSkillIcons(): SkillIconMap {
  if (!existsSync(SKILL_ICONS_FILE)) return {};
  try {
    const raw = JSON.parse(readFileSync(SKILL_ICONS_FILE, "utf8"));
    return raw && typeof raw === "object" ? (raw as SkillIconMap) : {};
  } catch {
    return {};
  }
}

function saveSkillIcons(map: SkillIconMap): void {
  ensureDir(APP_STATE_DIR);
  writeFileAtomic(SKILL_ICONS_FILE, JSON.stringify(map, null, 2));
}

/** Persist an explicit icon config for a skill key. */
export function setSkillIcon(key: string, cfg: SkillIconConfig): SkillIconConfig {
  const map = getSkillIcons();
  map[key] = cfg;
  saveSkillIcons(map);
  return cfg;
}

/** Generate + persist a fresh random icon for a skill key. */
export function rerollSkillIcon(key: string, iconClass: SkillIconClass = "any"): SkillIconConfig {
  const seed = randomUUID().replace(/-/g, "").slice(0, 16);
  return setSkillIcon(key, { seed, iconClass });
}
