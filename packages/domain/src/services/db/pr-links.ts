import { getDb } from "./connection";
import { PR_LINK_SOURCES, type PrLinkSource } from "../../config/review";
import type { PrLink } from "../../types/index";

interface PrLinkRow {
  repo: string;
  number: number;
  project_id: string | null;
  agent_id: string;
  instance_id: string;
  source: string;
}

const asSource = (s: string): PrLinkSource =>
  (PR_LINK_SOURCES as readonly string[]).includes(s) ? (s as PrLinkSource) : "manual";

export function getPrLink(repo: string, number: number): PrLink | null {
  const row = getDb()
    .prepare("SELECT repo, number, project_id, agent_id, instance_id, source FROM pr_links WHERE repo = ? AND number = ?")
    .get(repo.toLowerCase(), number) as PrLinkRow | undefined;
  if (!row) return null;
  return {
    repo: row.repo,
    number: row.number,
    projectId: row.project_id,
    agentId: row.agent_id,
    instanceId: row.instance_id,
    source: asSource(row.source),
  };
}

/** A manual pick corrects a wrong recording, and a later recording never undoes the pick. */
export function setPrLink(link: PrLink): void {
  getDb().prepare(`
    INSERT INTO pr_links (repo, number, project_id, agent_id, instance_id, source, created_at)
    VALUES (@repo, @number, @projectId, @agentId, @instanceId, @source, @createdAt)
    ON CONFLICT(repo, number) DO UPDATE SET project_id = excluded.project_id, agent_id = excluded.agent_id,
      instance_id = excluded.instance_id, source = excluded.source
    WHERE pr_links.source <> 'manual' OR excluded.source = 'manual'
  `).run({ ...link, repo: link.repo.toLowerCase(), createdAt: Date.now() });
}
