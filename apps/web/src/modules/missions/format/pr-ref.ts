import type { HubView } from "@agent-office/domain/types";

export interface PrRef {
  pr: number;
  repo: string | null;
}

/** `#12`, `12`, or a PR URL from any of its tabs (`/files`, `#issuecomment-…`). A URL also names its repo. */
const PR_REF = /^(?:#?(\d+)|(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)(?:[/?#].*)?)$/i;

export function parsePrRef(text: string): PrRef | null {
  const m = PR_REF.exec(text.trim());
  if (!m) return null;
  return { pr: Number(m[1] ?? m[3]), repo: m[2]?.toLowerCase() ?? null };
}

export const hubMatches = (h: HubView, ref: PrRef) =>
  h.pr === ref.pr && !h.closed && (!ref.repo || h.url.toLowerCase().includes(`/${ref.repo}/pull/`));
