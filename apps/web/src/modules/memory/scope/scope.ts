import { match } from "ts-pattern";
import type { MemoryScope } from "../hooks/use-memory";

// Stable string key for a scope — used for React keys and the content map.
export function scopeKey(scope: MemoryScope): string {
  return match(scope)
    .with({ kind: "global" }, () => "global")
    .with({ kind: "project" }, { kind: "agent" }, (s) => `${s.kind}:${s.id}`)
    .with({ kind: "agent-skill" }, (s) => `agent-skill:${s.agentId}:${s.skillSlug}`)
    .exhaustive();
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
  return match(scope)
    .with({ kind: "global" }, () => ({ kind: "path" as const, path: "~/.claude/agents/_global.memory.md" }))
    .with({ kind: "project" }, (s) => ({ kind: "project" as const, name: s.name }))
    .with({ kind: "agent" }, (s) => ({ kind: "path" as const, path: `~/.claude/agents/${s.id}.memory.md` }))
    .with({ kind: "agent-skill" }, (s) => ({ kind: "path" as const, path: `~/.claude/agents/_skills/${s.skillSlug}/SKILL.md` }))
    .exhaustive();
}
