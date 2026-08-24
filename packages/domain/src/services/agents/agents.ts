// Agent definitions: ~/.claude/agents/<id>.md (YAML frontmatter + markdown body).
// Sibling files, both optional:
//   - <id>.identity.md — foundational knowledge that is part of who the agent
//     is. Distributed with the app for bundled agents; users may add one to
//     their own agents. Included in every spawn.
//   - <id>.memory.md  — session-accumulated learnings for THIS installation.
//     Never ships with the app; grows as the agent runs.
//
// `buildAppendedPrompt` composes the per-summon system prompt from skills +
// identity + global memory + project memory + per-agent memory. Identity sits
// right after skills because it's static and never edited by the user, while
// memory (all three flavors) is treated as accumulated state.

import { readdirSync, readFileSync, existsSync, rmSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { ApiAgent, AgentBody, AgentBodyHistoryEntry, Project } from "../../types/index";
import { AGENTS_DIR, GLOBAL_MEMORY_PATH, isValidIdSegment } from "../infra/paths";
import { ensureDir, writeFileAtomic } from "../infra/fs-atomic";
import { isYamlMapping, parseYaml, stringifyYaml, type YamlMapping, type YamlValue } from "../infra/yaml";
import { buildSkillsPrompt } from "../skills/skills";
import * as accounts from "../accounts/accounts";
import * as githubAccounts from "../accounts/github-accounts";
import * as secrets from "../accounts/secrets";
import { historyNote } from "../projects/history";

interface ParsedFile {
  fm: YamlMapping;
  body: string;
}

export function hasFrontmatter(content: string): boolean {
  return /^---\n[\s\S]*?\n---\n?/.test(content);
}

function parseFrontmatter(content: string): ParsedFile {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: content };
  let fm: YamlMapping = {};
  try {
    const parsed = parseYaml(m[1]!);
    if (isYamlMapping(parsed)) fm = parsed;
  } catch {
    fm = {};
  }
  return { fm, body: m[2]! };
}

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof v === "string") {
    return v
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return [];
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function readAgent(name: string): { info: ApiAgent; body: string } | null {
  const path = join(AGENTS_DIR, `${name}.md`);
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf8");
  const { fm, body } = parseFrontmatter(content);
  const info: ApiAgent = {
    name: asString(fm.name) ?? name,
    displayName: asString(fm["display-name"] ?? fm["displayName"]),
    description: asString(fm.description) ?? "",
    skills: asStringList(fm.skills),
    tools: asStringList(fm.tools ?? fm["allowed-tools"]),
    defaultModel: asString(fm["default-model"] ?? fm.model),
    defaultEffort: asString(fm["default-effort"] ?? fm.effort),
    permissionMode: asString(fm["permission-mode"]),
    room: asString(fm.room),
    addDirs: asStringList(fm["add-dirs"] ?? fm["addDirs"]),
    unit: asString(fm.unit),
  };
  return { info, body: body.trim() };
}

export function listAgents(): ApiAgent[] {
  if (!existsSync(AGENTS_DIR)) return [];
  return readdirSync(AGENTS_DIR)
    .filter(
      (f) =>
        f.endsWith(".md") &&
        f.toLowerCase() !== "readme.md" &&
        !f.endsWith(".memory.md") &&
        !f.endsWith(".identity.md") &&
        !f.startsWith("_") &&
        !f.includes(".body.") &&
        hasFrontmatter(readFileSync(join(AGENTS_DIR, f), "utf8")),
    )
    .map((f) => readAgent(f.replace(/\.md$/, ""))?.info)
    .filter((a): a is ApiAgent => a !== undefined);
}

export function writeAgent(b: AgentBody): string {
  ensureDir(AGENTS_DIR);
  if (!isValidIdSegment(b.id)) throw new Error("invalid id");
  const id = b.id;
  const file = join(AGENTS_DIR, `${id}.md`);
  const fm: Record<string, YamlValue> = {
    name: id,
    description: b.desc.replace(/\n/g, " "),
    "default-model": b.model,
    "default-effort": b.effort,
    skills: b.skills,
    tools: b.tools,
    "permission-mode": b.pm,
  };
  // Human display name. Only persisted when it adds information over the slug,
  // so trivial "name == id" agents keep a clean frontmatter and fall back to
  // slug-prettifying in the UI.
  const label = b.name?.trim();
  if (label && label !== id) fm["display-name"] = label;
  if (b.room) fm.room = b.room;
  if (b.unit && b.unit.trim()) fm.unit = b.unit.trim();
  const content = `---\n${stringifyYaml(fm).trim()}\n---\n\n${b.body}\n`;
  writeFileAtomic(file, content);
  return id;
}

export function deleteAgent(id: string): boolean {
  const mdPath = join(AGENTS_DIR, `${id}.md`);
  if (!existsSync(mdPath)) return false;
  rmSync(mdPath);
  const memPath = memoryPathFor(id);
  if (existsSync(memPath)) rmSync(memPath);
  const identityPath = identityPathFor(id);
  if (existsSync(identityPath)) rmSync(identityPath);
  return true;
}

// ─── Body history (backup snapshots on every body overwrite) ────────────
//
// Snapshots are named `<id>.body.<epochMs>.md`. Epoch millis sort chronologically
// and round-trip with a plain Number() — no separator escaping, unlike a mangled
// ISO string. Legacy ISO-named files (Number() → NaN) fall back to file mtime.

const MAX_BODY_HISTORY = 10;

function bodyHistoryPrefix(id: string): string {
  return `${id}.body.`;
}

/** List an agent's body-history snapshots, newest-first, with parsed timestamps. */
export function listAgentBodyHistory(id: string): AgentBodyHistoryEntry[] {
  if (!existsSync(AGENTS_DIR)) return [];
  const prefix = bodyHistoryPrefix(id);
  return readdirSync(AGENTS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".md"))
    .map((filename) => {
      const stats = statSync(join(AGENTS_DIR, filename));
      const inner = filename.slice(prefix.length, -".md".length);
      const ts = Number(inner) || stats.mtimeMs;
      return { filename, ts, sizeBytes: stats.size };
    })
    .sort((a, b) => b.ts - a.ts);
}

/** Snapshot the given body text to a timestamped file, pruning to the newest
 *  MAX_BODY_HISTORY. Best-effort — never throws (a failed backup must not block a save). */
export function backupAgentBody(id: string, bodyText: string): void {
  try {
    ensureDir(AGENTS_DIR);
    writeFileAtomic(join(AGENTS_DIR, `${bodyHistoryPrefix(id)}${Date.now()}.md`), bodyText);
    for (const { filename } of listAgentBodyHistory(id).slice(MAX_BODY_HISTORY)) {
      try { unlinkSync(join(AGENTS_DIR, filename)); } catch { /* best-effort */ }
    }
  } catch {
    // backup failure must never block the save
  }
}

/** Read one body-history snapshot. Returns null for an unsafe filename or a miss. */
export function readAgentBodySnapshot(id: string, filename: string): string | null {
  const prefix = bodyHistoryPrefix(id);
  if (
    !filename.startsWith(prefix) ||
    !filename.endsWith(".md") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("..")
  ) {
    return null;
  }
  const path = join(AGENTS_DIR, filename);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

// ─── Identity files (foundational, ships with the agent) ────────────────

export function identityPathFor(agent: string): string {
  return join(AGENTS_DIR, `${agent}.identity.md`);
}

/**
 * Read the identity file for an agent, if present. Returns empty string when
 * the file doesn't exist — identity is optional. This is the counterpart to
 * `.memory.md`: identity ships with the agent, memory accumulates locally.
 */
export function readAgentIdentity(agentId: string): string {
  const path = identityPathFor(agentId);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

// ─── Memory files ────────────────────────────────────────────────────────

export function memoryPathFor(agent: string): string {
  return join(AGENTS_DIR, `${agent}.memory.md`);
}

export function readMemory(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

export function writeMemoryFile(path: string, content: string): void {
  ensureDir(AGENTS_DIR);
  writeFileAtomic(path, content);
}

export function readGlobalMemory(): string {
  return readMemory(GLOBAL_MEMORY_PATH);
}

export function writeGlobalMemory(content: string): void {
  writeMemoryFile(GLOBAL_MEMORY_PATH, content);
}

export function readAgentMemory(agentId: string): string {
  return readMemory(memoryPathFor(agentId));
}

export function writeAgentMemory(agentId: string, content: string): void {
  writeMemoryFile(memoryPathFor(agentId), content);
}

/**
 * Composition order: skills → identity → global → project → per-agent → history note.
 * Identity is foundational (ships with the agent, part of who it is) so it
 * comes right after skills and before all three memory layers. Caller passes
 * a pre-resolved `Project` (or null) - we don't import the projects service
 * here to avoid a cycle.
 */
/**
 * Non-secret environment manifest injected into the agent's system prompt so it
 * KNOWS — never guesses — which identities it operates as and what keys it holds.
 * Names only: raw secret values never appear here (they reach the agent solely as
 * env vars injected at spawn). DB reads are wrapped defensively so a missing/locked
 * store degrades to "no block" rather than failing the whole prompt build.
 */
function buildProjectEnvironmentBlock(project: Project): string | null {
  const lines: string[] = [];
  try {
    if (project.meta.accountId) {
      const acc = accounts.get(project.meta.accountId);
      if (acc) {
        const plan = accounts.getPlan(project.meta.accountId);
        lines.push(`- Claude account: ${acc.label} (${plan} plan)`);
      }
    }
    if (project.meta.githubAccountId) {
      const gh = githubAccounts.get(project.meta.githubAccountId);
      if (gh) {
        lines.push(
          `- GitHub: \`git push\` and \`gh\` authenticate as "${gh.label}" — this is the only GitHub identity in your environment, so never switch or guess accounts`,
        );
      }
    }
    const names = secrets.listForProject(project.id).map((s) => s.name);
    if (names.length > 0) {
      lines.push(
        `- Secrets in your environment: ${names.join(", ")} ` +
          `(already set as env vars — use them directly, e.g. $${names[0]}; never print their values)`,
      );
    }
  } catch {
    return null;
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

export function buildAppendedPrompt(agentName: string, project: Project | null, instanceId?: string, hasMessages?: boolean): string {
  const agent = readAgent(agentName);
  const skillFragment = agent ? buildSkillsPrompt(agent.info.skills).trim() : "";
  const identity = readAgentIdentity(agentName).trim();
  const global = readGlobalMemory().trim();
  const projectMemory = project?.memory.trim() ?? "";
  const perAgent = readAgentMemory(agentName).trim();
  const permissionMode = agent?.info.permissionMode;

  const parts: string[] = [];
  if (skillFragment) parts.push("## Capabilities (from selected skills)\n\n" + skillFragment);
  if (identity) parts.push(`## Identity (${agentName} — part of who this agent is)\n` + identity);
  if (global) parts.push("## Global memory (applies to every agent)\n" + global);
  if (project) {
    const projectLines = [`**Project:** ${project.meta.name}`];
    if (project.meta.cwd) projectLines.push(`**Working directory:** ${project.meta.cwd}`);
    if (project.meta.description) projectLines.push(`**Description:** ${project.meta.description}`);
    parts.push(`## Active project\n` + projectLines.join("\n"));
    const envBlock = buildProjectEnvironmentBlock(project);
    if (envBlock) parts.push(`## Project environment\n` + envBlock);
  }
  if (projectMemory) parts.push(`## Project memory (${project!.meta.name})\n` + projectMemory);
  if (perAgent) parts.push(`## Memory specific to ${agentName}\n` + perAgent);

  if (permissionMode !== "plan" && !hasMessages) {
    const effectiveInstanceId = instanceId ?? "default";
    const hNote = historyNote(agentName, effectiveInstanceId);
    parts.push(
      `## Conversation history\n` +
      `Your past runs are stored in SQLite: ${hNote}\n` +
      `Use the sqlite3 command shown above to read past context when you need to recall previous sessions.`
    );
  }

  return parts.join("\n\n");
}
