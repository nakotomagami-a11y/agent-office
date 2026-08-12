/**
 * Docs service — agent-authored context files.
 *
 * Layout on disk:
 *   ~/.claude/agent-office/docs/<owner>/<slug>.md
 *
 * `owner` is either an agent-id (e.g. `frontend-craftsman`) or the sentinel
 * `_global` for docs that aren't scoped to any single agent. Each `.md`
 * carries YAML frontmatter for title / category / timestamps, then the
 * markdown body. We parse frontmatter by hand — the existing agent-loader
 * uses the same tiny approach, and pulling in gray-matter for two fields is
 * more risk than reward.
 *
 * A "doc" here is distinct from a "memory" file: memory is the small
 * always-injected note attached to global/project/agent; docs are the
 * long-form architecture notes, plans, postmortems, and reference material
 * that agents write to build up institutional memory for the workspace.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { DOCS_DIR, DOCS_GLOBAL_OWNER, isValidIdSegment } from "./paths";

// ─── Types ───────────────────────────────────────────────────────────────────

export const DOC_CATEGORIES = [
  "architecture",
  "plan",
  "notes",
  "postmortem",
  "context",
  "reference",
] as const;

export type DocCategory = (typeof DOC_CATEGORIES)[number];

export function isDocCategory(v: unknown): v is DocCategory {
  return typeof v === "string" && (DOC_CATEGORIES as readonly string[]).includes(v);
}

export interface DocFrontmatter {
  title: string;
  category: DocCategory;
  created: string; // ISO 8601
  updated: string; // ISO 8601
}

export interface DocMeta extends DocFrontmatter {
  /** Owner slug — either an agent-id or `_global`. */
  owner: string;
  /** Filename without extension. Stable, URL-safe id. */
  slug: string;
}

export interface Doc extends DocMeta {
  /** Markdown body (frontmatter stripped). */
  body: string;
}

// ─── Frontmatter parse / serialize ───────────────────────────────────────────

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

interface ParsedDoc {
  frontmatter: Partial<DocFrontmatter>;
  body: string;
}

function parseDocFile(raw: string): ParsedDoc {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) return { frontmatter: {}, body: raw };
  const rawFm = match[1] ?? "";
  const body = raw.slice(match[0].length);
  const fm: Partial<DocFrontmatter> = {};
  for (const line of rawFm.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // Strip surrounding quotes on scalar values.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key === "title") fm.title = value;
    else if (key === "category" && isDocCategory(value)) fm.category = value;
    else if (key === "created") fm.created = value;
    else if (key === "updated") fm.updated = value;
  }
  return { frontmatter: fm, body };
}

function serializeDoc(meta: DocFrontmatter, body: string): string {
  const safeTitle = meta.title.replace(/"/g, '\\"');
  return [
    "---",
    `title: "${safeTitle}"`,
    `category: ${meta.category}`,
    `created: ${meta.created}`,
    `updated: ${meta.updated}`,
    "---",
    "",
    body.trimStart(),
  ].join("\n");
}

// ─── Owner + slug validation ────────────────────────────────────────────────

function assertValidOwner(owner: string): void {
  if (owner === DOCS_GLOBAL_OWNER) return;
  if (!isValidIdSegment(owner)) {
    throw new Error(`invalid owner segment: ${owner}`);
  }
}

function assertValidSlug(slug: string): void {
  if (!isValidIdSegment(slug)) {
    throw new Error(`invalid slug segment: ${slug}`);
  }
}

function docPath(owner: string, slug: string): string {
  assertValidOwner(owner);
  assertValidSlug(slug);
  return join(DOCS_DIR, owner, `${slug}.md`);
}

// ─── Query API ───────────────────────────────────────────────────────────────

/**
 * List every doc across every owner. Bodies are NOT loaded — this only reads
 * frontmatter for the nav. Sort is (updated DESC).
 */
export function listDocs(): DocMeta[] {
  if (!existsSync(DOCS_DIR)) return [];
  const out: DocMeta[] = [];
  for (const owner of readdirSync(DOCS_DIR)) {
    const ownerDir = join(DOCS_DIR, owner);
    if (!statSync(ownerDir).isDirectory()) continue;
    for (const file of readdirSync(ownerDir)) {
      if (!file.endsWith(".md")) continue;
      const slug = file.slice(0, -3);
      const raw = readFileSync(join(ownerDir, file), "utf8");
      const { frontmatter } = parseDocFile(raw);
      if (
        !frontmatter.title ||
        !frontmatter.category ||
        !frontmatter.created ||
        !frontmatter.updated
      ) {
        // Malformed doc — skip silently so a single bad file doesn't nuke the tab.
        continue;
      }
      out.push({
        owner,
        slug,
        title: frontmatter.title,
        category: frontmatter.category,
        created: frontmatter.created,
        updated: frontmatter.updated,
      });
    }
  }
  return out.sort((a, b) => b.updated.localeCompare(a.updated));
}

export function readDoc(owner: string, slug: string): Doc | null {
  const path = docPath(owner, slug);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const { frontmatter, body } = parseDocFile(raw);
  if (
    !frontmatter.title ||
    !frontmatter.category ||
    !frontmatter.created ||
    !frontmatter.updated
  ) {
    return null;
  }
  return {
    owner,
    slug,
    title: frontmatter.title,
    category: frontmatter.category,
    created: frontmatter.created,
    updated: frontmatter.updated,
    body,
  };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface UpsertDocInput {
  owner: string;
  slug: string;
  title: string;
  category: DocCategory;
  body: string;
}

/**
 * Create or update. If the doc exists, `created` is preserved and `updated`
 * is bumped; if not, both are set to now.
 */
export function upsertDoc(input: UpsertDocInput): Doc {
  const path = docPath(input.owner, input.slug);
  mkdirSync(join(DOCS_DIR, input.owner), { recursive: true });

  const now = new Date().toISOString();
  const existing = existsSync(path) ? readDoc(input.owner, input.slug) : null;
  const meta: DocFrontmatter = {
    title: input.title,
    category: input.category,
    created: existing?.created ?? now,
    updated: now,
  };
  writeFileSync(path, serializeDoc(meta, input.body), "utf8");
  return { owner: input.owner, slug: input.slug, ...meta, body: input.body };
}

export function deleteDoc(owner: string, slug: string): void {
  const path = docPath(owner, slug);
  if (existsSync(path)) rmSync(path);
}
