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
