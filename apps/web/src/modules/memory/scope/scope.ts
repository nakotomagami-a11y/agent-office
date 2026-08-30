import { assertNever } from "@/lib/assert-never";
import type { MemoryScope } from "../hooks/use-memory";

// Stable string key for a scope — used for React keys and the content map.
export function scopeKey(scope: MemoryScope): string {
  switch (scope.kind) {
    case "global": return "global";
    case "project":
    case "agent":
      return `${scope.kind}:${scope.id}`;
    case "agent-skill": return `agent-skill:${scope.agentId}:${scope.skillSlug}`;
    default: return assertNever(scope);
  }
}

/**
 * Where a scope's text actually lives — real paths for file-backed scopes
 * (global/agent/skill), a plain description for project memory, which is a
 * DB column (`projects.memory`), not a file. Returns structured parts (not
 * a rendered string) so the caller can localize the "project memory" label
 * via `messages/en.json` — this module is pure/no-React, so it can't call
 * `useTranslations()` itself.
 */
export type ScopeLabelParts = { kind: "path"; path: string } | { kind: "project"; name: string };

export function scopeLabelParts(scope: MemoryScope): ScopeLabelParts {
  switch (scope.kind) {
    case "global": return { kind: "path", path: "~/.claude/agents/_global.memory.md" };
    case "project": return { kind: "project", name: scope.name };
    case "agent": return { kind: "path", path: `~/.claude/agents/${scope.id}.memory.md` };
    case "agent-skill": return { kind: "path", path: `~/.claude/agents/_skills/${scope.skillSlug}/SKILL.md` };
    default: return assertNever(scope);
  }
}
