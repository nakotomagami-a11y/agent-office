// What a run's prompt carries besides Claude Code's own native overhead: discovered
// CLAUDE.md/AGENTS.md files, the appended prompt, the agent's MCP servers. Shared by the
// Context & Cost estimate (context-cost.ts) and "Measure exactly" (context-cost-measure.ts),
// so neither imports the other.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentInstance, Project } from "../../types/index";
import { estimateTokens } from "../infra/token-estimate";
import { buildAppendedPrompt } from "./agents";

/** Instance's own worktree cwd if it has one, else the project root.
 *  Deliberately not `projects.resolveInstanceCwd`, which creates/heals git
 *  worktrees — a side effect that must never fire from a cost calculation. */
export function resolveReadonlyCwd(project: Project | null, instance: AgentInstance | null): string | undefined {
  const c = instance?.cwd?.trim();
  if (c) return c;
  return project?.meta.cwd?.trim() || undefined;
}

export function lineCount(text: string): number {
  return text ? text.split("\n").length : 0;
}

const MAX_DISCOVERY_DEPTH = 8;

export interface DiscoveredFile { path: string; tokens: number; lines: number }

/** Every `CLAUDE.md`/`AGENTS.md` Claude Code would discover walking up from
 *  each root (the instance cwd PLUS every `--add-dir` the agent passes — those
 *  dirs get their own discovery too) to the filesystem root. Deduped by path,
 *  each measured on its own. */
export function discoverContextFiles(roots: Array<string | undefined>): DiscoveredFile[] {
  const found: DiscoveredFile[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    let dir = root && existsSync(root) ? root : undefined;
    for (let i = 0; dir && i < MAX_DISCOVERY_DEPTH; i++) {
      for (const name of ["CLAUDE.md", "AGENTS.md"]) {
        const p = join(dir, name);
        if (seen.has(p) || !existsSync(p)) continue;
        seen.add(p);
        try {
          const body = readFileSync(p, "utf8");
          found.push({ path: p, tokens: estimateTokens(body), lines: lineCount(body) });
        } catch {
          /* unreadable — skip, not fatal to the estimate */
        }
      }
      const parent = dirname(dir);
      dir = parent === dir ? undefined : parent;
    }
  }
  return found;
}

/** Discovery roots for an agent+instance: its real cwd plus every `--add-dir`
 *  the agent declares (tildes expanded), matching buildClaudeArgs. */
export function discoveryRoots(cwd: string | undefined, addDirs: string[]): Array<string | undefined> {
  return [cwd, ...addDirs.map((d) => d.replace(/^~/, homedir()))];
}

/** Accurate token count of everything in a run's prompt that is NOT native
 *  overhead: CLAUDE.md/AGENTS.md discovery plus the whole appended prompt.
 *  Used to isolate native overhead by subtraction — both the history-based
 *  estimate and "Measure exactly" reuse this so they can't diverge. Measures
 *  the real composed string (not a sum of per-section estimates, which would
 *  miss headers/wrapper text and overstate native by that much). */
export function nonNativeKnownTokens(agentId: string, project: Project | null, cwd: string | undefined, addDirs: string[]): number {
  const appended = buildAppendedPrompt(agentId, project, undefined, false);
  const discovered = discoverContextFiles(discoveryRoots(cwd, addDirs)).reduce((a, f) => a + f.tokens, 0);
  return estimateTokens(appended) + discovered;
}

/** Server names this agent actually loads, parsed from its own `tools:`
 *  frontmatter (e.g. `"mcp__playwright__*"` → `"playwright"`) — NOT every
 *  globally-configured MCP server, which is the bug this feature replaces. */
export function agentMcpServerNames(tools: string[]): string[] {
  const names = new Set<string>();
  for (const t of tools) {
    const parts = t.split("__");
    if (parts.length >= 2 && parts[0] === "mcp") names.add(parts[1]!);
  }
  return Array.from(names);
}
