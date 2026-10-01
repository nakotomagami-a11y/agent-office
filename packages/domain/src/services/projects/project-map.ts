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

/** Git with the REPO'S OWN CONFIG NEUTRALISED. `git status` executes
 *  `core.fsmonitor` from `.git/config`, and this runs on every prompt
 *  composition inside the app server — so a hostile repo (or an `acceptEdits`
 *  agent writing `.git/config`) was RCE. Verified on git 2.55.0. */
function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", ["-c", "core.fsmonitor=", "-c", "core.hooksPath=/dev/null", ...args], {
      cwd,
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
        GIT_OPTIONAL_LOCKS: "0",
      },
    }).toString().trim();
  } catch {
    return null; // not a repo, or git unavailable — the caller omits the line
  }
}

/** Repo-controlled text is DATA. Directory names may contain newlines, and this
 *  block lands in every agent's system prompt — so a crafted name could forge a
 *  prompt section. */
export function clean(s: string, max = 80): string {
  // By CODE POINT: a UTF-16 slice split an emoji into a lone surrogate.
  return [...s.replace(/[\p{Cc}\p{Cf}]/gu, " ")].slice(0, max).join("").trim();
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

export function topLevelEntries(cwd: string): string[] {
  const SKIP = new Set([
    "node_modules", ".git", ".next", "dist", "build", "target", "out",
    ".turbo", ".cache", "coverage", ".worktrees", ".venv", "__pycache__",
  ]);
  try {
    return readdirSync(cwd, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith(".") && /^[\w.@-]+$/.test(e.name))
      .map((e) => e.name)
      .sort()
      .slice(0, 12);
  } catch {
    return [];
  }
}

export function conventionDocs(cwd: string): string[] {
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
    cmds.push(`${clean(label, 24)}: \`${clean(key, 120)}\``);
  };
  if (build) push("build", build);
  for (const d of detectDevCommands(cwd)) push(d.name.split("·").pop()!.trim().toLowerCase(), d.argv);
  if (cmds.length > 0) lines.push(`- Commands (${pm}) — ${cmds.join(" · ")}`);

  // `branch` doubles as the "is this a repo" check.
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  if (branch) {
    const dirty = git(["status", "--porcelain"], cwd);
    const changed = dirty ? dirty.split("\n").filter(Boolean).length : 0;
    lines.push(`- Git: on \`${clean(branch)}\`, ${changed} uncommitted file${changed === 1 ? "" : "s"}`);
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
