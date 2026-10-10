import type { ProjectMetaPatch } from "@agent-office/domain/types";
import type { projectMetaPatchSchema } from "@agent-office/api-contract";
import type { z } from "zod";

type ParsedBody = z.infer<typeof projectMetaPatchSchema>;

/**
 * Map a validated request body to a domain update patch.
 *
 * This is deliberately a pure, tested pass-through. The 2026-09-30 field loss
 * was caused by a "harmless" normalisation step here
 * (`accountId: meta.accountId ?? undefined`) that made an absent key PRESENT,
 * which the domain merge then applied as a clear. Any transform added here
 * must keep `absent` and `undefined` distinct — so the mapping is pinned by
 * project-meta-patch.test.ts rather than left to inspection.
 */
export function toProjectUpdatePatch(
  data: ParsedBody,
): { [K in keyof ParsedBody]: K extends "meta" ? ProjectMetaPatch | undefined : ParsedBody[K] } {
  // Spread, not a hand-copied key list: a new top-level schema key would
  // otherwise be silently dropped here — the same "mapping quietly disagrees
  // with the schema" failure as the `?? undefined` this file replaced. The
  // mapped return type makes an omission a compile error.
  return { ...data, meta: data.meta };
}
