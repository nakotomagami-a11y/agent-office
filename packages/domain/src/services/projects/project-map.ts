// The project map injected into every agent's system prompt: what exists, where
// it lives, how to run it — derived live so it cannot go stale. Replaces facts
// that were hand-typed into agent bodies (D3 shipped an unfilled
// `MAIN=/path/to/agent-office`). Sync because composeAppendedPrompt is.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentInstance, Project } from "../../types/index";
import { SYSTEM_GH_CONFIG_DIR } from "../infra/paths";
import { detectBuildCommand, detectDevCommands, detectPackageManager } from "./project-runtime";

function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim();
  } catch {
    return null; // not a repo, or git unavailable — the caller omits the line
  }
}

/** The login `gh`/`git push` will use. Reads only the `user:` key — no network,
 *  no token access. */
export function readSystemGhUser(): string | null {
  try {
    const raw = readFileSync(join(SYSTEM_GH_CONFIG_DIR, "hosts.yml"), "utf8");
    const m = /^\s*user:\s*(\S+)\s*$/m.exec(raw);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function topLevelEntries(cwd: string): string[] {
  const SKIP = new Set([
    "node_modules", ".git", ".next", "dist", "build", "target", "out",
    ".turbo", ".cache", "coverage", ".worktrees", ".venv", "__pycache__",
  ]);
  try {
    return readdirSync(cwd, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort()
      .slice(0, 12);
  } catch {
    return [];
  }
}

function conventionDocs(cwd: string): string[] {
  const candidates = [
    "CLAUDE.md", "AGENTS.md", "CONTRIBUTING.md",
    "docs/conventions.md", "docs/architecture.md",
  ];
  return candidates.filter((f) => existsSync(join(cwd, f)));
}

export interface ProjectMapInput {
  project: Project;
  instance?: AgentInstance | null;
}

/** Prompt block, or null when there is no cwd on disk. */
export function buildProjectMap({ project, instance }: ProjectMapInput): string | null {
  const cwd = instance?.cwd ?? project.meta.cwd;
  if (!cwd || !existsSync(cwd)) return null;

  const lines: string[] = [];

  const dirs = topLevelEntries(cwd);
  if (dirs.length > 0) lines.push(`- Layout: ${dirs.join(", ")}`);

  const docs = conventionDocs(cwd);
  if (docs.length > 0) {
    lines.push(`- Read before writing code: ${docs.join(", ")}`);
  }

  const pm = detectPackageManager(cwd);
  const build = detectBuildCommand(cwd, pm);
  // Monorepo detection reports one script per workspace package.
  const seen = new Set<string>();
  const cmds: string[] = [];
  const push = (label: string, argv: string[]) => {
    const key = argv.join(" ");
    if (seen.has(key) || cmds.length >= 5) return;
    seen.add(key);
    cmds.push(`${label}: \`${key}\``);
  };
  if (build) push("build", build);
  for (const d of detectDevCommands(cwd)) push(d.name.split("·").pop()!.trim().toLowerCase(), d.argv);
  if (cmds.length > 0) lines.push(`- Commands (${pm}) — ${cmds.join(" · ")}`);

  // `branch` doubles as the "is this a repo" check.
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  if (branch) {
    const dirty = git(["status", "--porcelain"], cwd);
    const changed = dirty ? dirty.split("\n").filter(Boolean).length : 0;
    lines.push(`- Git: on \`${branch}\`, ${changed} uncommitted file${changed === 1 ? "" : "s"}`);
  }

  if (instance?.worktree) {
    lines.push(
      `- You are in a git worktree at \`${instance.worktree.basePath}\` on branch ` +
        `\`${instance.worktree.branch}\`. The user's main checkout is \`${project.meta.cwd}\`. ` +
        `Work here is invisible there until it is delivered.`,
    );
  }

  const ghUser = readSystemGhUser();
  if (ghUser && !project.meta.githubAccountId) {
    lines.push(
      `- GitHub: \`git push\` and \`gh\` are already authenticated as "${ghUser}". ` +
        `This is the only GitHub identity here — never switch, re-authenticate, or ` +
        `ask the user for credentials.`,
    );
  }

  return lines.length > 0 ? lines.join("\n") : null;
}
